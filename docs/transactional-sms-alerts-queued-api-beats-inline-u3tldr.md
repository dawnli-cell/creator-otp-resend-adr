# Transactional SMS Alerts: Queued API Beats Inline Service on 3 Scheduled Delivery Rules

Choose queued dispatch over inline sending when an education platform must explain why a generated report was emailed, why an accompanying SMS alert was allowed, and what happened after either channel accepted the request. TL;DR: keep scheduling, suppression, and evidence in an application-owned dispatch ledger; treat email submission, SMS submission, and delivery observations as separate events. This is a choice about compliance evidence, with operating cost as a constraint.

The report travels as an email attachment. SMS carries a minimal notification, without the report or its educational contents. A startup evaluating transactional SMS alternatives for US and EU recipients therefore needs more than an API that accepts a destination: it needs a reconstructable decision for each channel, including the recipient mapping and policy that were effective when dispatch was authorized. The backend implementation language does not change that requirement.

## Decision and the 3 invariants

This architecture decision adopts a durable queue backed by a dispatch ledger. Inline sending remains a bounded alternative described below. The queue is an architectural proposal, not a claim that a particular service supplies these controls.

The first invariant is identity: one logical notification has one stable identifier, while individual submission attempts have their own identifiers. For a synthetic example, report revision 3 for learner record L-204 may produce an email intent and an SMS intent; they are related to the same report, but a successful SMS must never satisfy the email attachment obligation. A resend is a separately authorized action linked to its predecessor. It is not a silent reset of history.

The second invariant is authorization: dispatch must refer to an applicable recipient and channel policy, and the evidence must identify the policy revision used. Enqueuing an alert establishes intent, not indefinite permission to send it. A suppression change before execution must be considered by the worker, with the decision recorded even when the result is no message.

The third invariant is reconciliation: internal state must distinguish a queued intent, an attempted submission, an accepted submission, an ambiguous submission, and a delivery observation. These are proposed application states. They must be mapped to the actual semantics of the chosen transport rather than assigned by matching convenient status names.

Acceptance proves less.

For email, SMTP describes a transfer of responsibility after acceptance; it does not establish that a learner read the attachment. Delivery status notifications have their own structure under RFC 3464. Neither should be converted into a claim of human receipt. For SMS, record the documented meaning and provenance of each delivery event before using it as evidence. A service comparison should examine those definitions, not merely whether a dashboard has a green indicator.

## How should a transactional SMS alerts service preserve suppression and delivery tracking?

The ledger should connect the report revision, recipient reference, channel, scheduled instant, authorization decision, and attempt history. Where useful, store a digest of the attachment artifact alongside the generation record, so reconciliation can identify which bytes the application intended to submit. A digest is evidence of artifact identity; it does not prove that the address belonged to the right guardian, that the recipient opened the file, or that sending it was legally permitted. The recipient relationship needs its own evidence.

This distinction matters in education. A report may involve personal data, and a technically complete event log is not a blanket compliance certificate. GDPR Article 5 sets out principles including data minimization, storage limitation, and accountability; Article 32 addresses security of processing. Their applicability and the appropriate retention period require assessment for the actual organization and processing activity. This decision record does not establish US or EU legal permission to send an SMS or disclose an educational report.

Keep the evidence bounded.

Store internal recipient references and controlled policy evidence rather than copying report contents into every queue payload, application log, and delivery callback record. Restrict access to the attachment and the recipient mapping, and define retention and deletion for both message artifacts and their audit records. The resulting trade-off is deliberate: less replicated sensitive content makes some debugging less convenient, so authorized reconciliation tooling must resolve references without turning routine logs into a second student database.

## Compare the two dispatch designs

The comparison concerns application architecture. Either design still requires a transport whose documented behavior meets the channel's needs.

| Decision criterion | Queued dispatch with a ledger | Inline sending from the report request |
| --- | --- | --- |
| Evidence of intent | Record the report reference, policy decision, and outbox entry in one transaction | Requires a separate durable record; the network call cannot be part of the local database commit |
| Scheduled SMS alerts | Persist a due instant and recheck suppression when claimed | Requires another scheduling mechanism once the request ends |
| Ambiguous submission | Preserve an unresolved attempt for reconciliation | A request timeout still needs persistent state to avoid blind resends |
| Delivery tracking | Associate incoming observations with recorded attempts | Possible, but correlation must outlive the request |
| Team burden | Own worker leases, migrations, evidence access, and backlog operations | Smaller initial execution path; durable recovery adds separate work |

The queue wins here because compliance evidence is the primary decision axis and the workflow includes scheduled alerts. Its extra machinery is justified by the need to explain deferred actions after the generating request has disappeared. If the team cannot operate that machinery, that is a deployment constraint to resolve before launch, rather than a reason to describe an unrecorded submission as auditable.

Budget for retained artifacts, event storage, worker operation, and reconciliation effort alongside transport charges. There is no universal lowest-cost answer in this record. An API that makes submission convenient may still leave the application responsible for the evidence boundary.

## Commit intent before crossing the network

The following Go example specifies the database contract for creating an email or SMS intent. It is an interface-level design, not a transport SDK or a complete runnable service. The storage implementation must enforce uniqueness on the stable intent ID and make all transaction operations atomic; returning an existing ID must also verify that its immutable fields match the original intent. A conflicting payload is an error.

```go
package dispatch

import "context"

type Intent struct {
    ID             string
    ReportRevision string
    RecipientRef   string
    Channel        string
    PolicyRevision string
}

type Tx interface {
    InsertIntent(context.Context, Intent) (created bool, err error)
    Allowed(context.Context, Intent) (bool, error)
    AppendDecision(context.Context, Intent, string) error
    InsertOutbox(context.Context, string) error
}

type Store interface {
    WithinTx(context.Context, func(Tx) error) error
}

func Prepare(ctx context.Context, db Store, in Intent) error {
    return db.WithinTx(ctx, func(tx Tx) error {
        created, err := tx.InsertIntent(ctx, in)
        if err != nil {
            return err
        }
        if !created {
            return nil
        }
        allowed, err := tx.Allowed(ctx, in)
        if err != nil {
            return err
        }
        if !allowed {
            return tx.AppendDecision(ctx, in, "suppressed")
        }
        if err := tx.AppendDecision(ctx, in, "queued"); err != nil {
            return err
        }
        return tx.InsertOutbox(ctx, in.ID)
    })
}
```

The useful property is the transaction boundary: a committed authorized intent has both its decision record and its outbox entry, while a suppressed intent has evidence of suppression without an outbox entry. No transport call occurs inside this transaction. Otherwise, a remote acceptance followed by a local rollback could erase the application's account of a real submission.

The worker is a second boundary. It claims due work, rechecks current suppression and recipient eligibility, durably records the attempt and authorization revision, and only then submits. Define a serialization point for policy updates and dispatch authorization; a policy change after that point may arrive too late to stop a request already leaving the process. Document that limit. A local transaction cannot retract an accepted external message. Consider a proposed failure test for learner record L-204: the worker records an attempt, submits the email attachment, and loses its connection before receiving a response. A second worker later acquires the expired lease. The dangerous inference is that an expired lease means the attachment was never sent; it establishes only that the first worker no longer owns the work. The replacement worker must see the unresolved attempt and follow the reconciliation policy instead of treating the outbox row as fresh permission to submit. This sacrifices immediate automatic recovery when acceptance cannot be established, because a duplicate educational report creates its own evidence problem. A separately authorized resend may be appropriate, but it should retain the link to the ambiguous attempt rather than erase it.

Preserve that uncertainty.

An exactly-once mindset means preventing duplicate logical work wherever the system controls the boundary and admitting uncertainty elsewhere. If a connection fails after submission may have reached the transport, mark the attempt ambiguous. Reconcile through documented lookup or event mechanisms where available, and reuse a stable submission key only when the transport documents the relevant idempotency scope and retention. An internal unique constraint alone cannot promise exactly-once external delivery.

For the attachment, use the MIME representation defined by the mail standards and test the actual serialized message. RFC 2045 defines MIME content-transfer encodings, while RFC 2183 defines Content-Disposition, including attachment handling. Validate configured size limits against the serialized representation and transport documentation; the original report file size is not the entire message size.

## Rejected option, rollout, and acceptance evidence

Inline sending is rejected for this scheduled report workflow because keeping the generating request open does not supply durable authorization history or recovery after an ambiguous submission. It has a valid use case for a development preview sent to a controlled test recipient, where the operator can repeat the action and no production reporting obligation depends on it. That boundary should be explicit.

Before production, exercise duplicate enqueue requests, suppression between enqueue and dispatch, concurrent worker claims, a crash after remote acceptance but before recording the result, and repeated or out-of-order delivery events. Assert the evidence left behind, not merely the final success flag. Attachment tests should confirm the intended report revision and recipient, MIME structure, and the absence of report content in the SMS payload. These are proposed acceptance tests, not reported test results.

Deploy storage changes before workers that require them. Use controlled recipients to validate event correlation, then increase traffic only after reconciliation can distinguish unresolved attempts from confirmed outcomes. Monitor oldest due work, ambiguous attempts, suppressed dispatches, and unmatched delivery events as separate operational signals; a low error count does not explain a growing backlog.

The selection rule remains narrow: choose queued email and SMS dispatch when scheduled educational reports require reconstructable authorization, artifact identity, and delivery evidence. Require any candidate transport to demonstrate its attachment boundary, suppression integration, idempotency semantics, and event definitions against that record. If those details are undocumented, record the unresolved requirement before approving the design.

## References

- SMTP acceptance and responsibility: https://www.rfc-editor.org/rfc/rfc5321
- MIME message bodies and transfer encodings: https://www.rfc-editor.org/rfc/rfc2045
- Content-Disposition and attachments: https://www.rfc-editor.org/rfc/rfc2183
- Delivery status notification format: https://www.rfc-editor.org/rfc/rfc3464
- General Data Protection Regulation, including Articles 5 and 32: https://eur-lex.europa.eu/eli/reg/2016/679/oj
