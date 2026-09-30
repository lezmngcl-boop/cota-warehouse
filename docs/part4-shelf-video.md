# Part 4: Shelf video to SKU, location and visible case count

**Principle:** the AI proposes, a person approves. Video output never writes to inventory directly.

## 1. Study and standardize the scan first
Before building anything, I would record real scans and run them through a frame-by-frame video analysis process to see where footage breaks down: blur, glare, cases stacked two deep, labels facing inward. That defines a good scan, written as a short protocol:
- One location per clip, at a steady walk, from a fixed height and distance.
- Case labels facing out.
- The shelf's location barcode captured before the clip ends.

I would re-scan the same shelves and tune the protocol and analysis until repeat scans agree. Consistency comes first; a human still approves every result.

## 2. Capture and processing
The employee taps **Scan shelf** in the existing web app and records a 10–20 second clip; the upload resumes if the connection drops. A queued server job:
1. Splits the video into frames and drops blurry ones.
2. Decodes barcodes.
3. Analyses the frames one by one for SKU labels and visible cases.

A count is proposed only when several frames agree; otherwise it is marked uncertain, not averaged.

## 3. Location context
Every bay carries a location barcode, and it must be scanned before the video ends. Location comes from decoding that barcode, never from the AI's guess. A clip without a readable location barcode is rejected, with a prompt to rescan.

## 4. Strict JSON output
The model must return JSON matching a fixed schema:

```json
{ "scan_id": "…", "location": "A1-R2-S1", "location_source": "barcode",
  "observations": [
    { "sku": "TURTLE-01", "visible_cases": 17, "confidence": 0.86,
      "evidence_frames": [12, 18, 24], "notes": "back row partly hidden" } ] }
```

A strict parser validates it before anything is stored. Anything malformed is rejected, not repaired. SKUs must exist, counts must be whole numbers in a sane range, and each count needs evidence frames. Only **visible** cases are counted, with a note when a stack may hide more.

## 5. Evaluating accuracy
Film around 50 locations and have people count them by hand to create an answer key. Measure how often the location is right, how often the SKU is right (missed and wrong products), how often the count is exact, and the average count error. Results are split by condition (lighting, stack height, hidden cases). Nothing goes live until it passes an agreed bar. After launch, a random 5% of accepted scans are re-counted by hand to catch drift.

## 6. Uncertain results
Low confidence, an unknown SKU, counts that disagree between frames, or a missing location barcode are routed automatically to a human review queue, with the relevant frames attached. The system never creates new SKUs and never guesses.

## 7. Protecting inventory
Three layers:
1. **Strict output parser.** Invalid AI output never gets past validation.
2. **Proposals only.** Results are written to a separate scan-proposals table. Inventory tables are never touched.
3. **Review gate.** A proposal only becomes a stock change when a person approves it. The approved adjustment is saved in one transaction with from/to counts, the reason, the approver and the source scan.

Extra guards:
- **Large differences** (for example more than 2 cases or 20%) need a supervisor's second approval.
- **Stock changed since the scan** (for example a pick): the proposal goes back to review instead of overwriting.
- **Mistakes** are fixed with a new, reversing adjustment. Nothing is edited in place.

## 8. What gets saved
- The raw video (for a set period, such as 90 days) and the evidence frames.
- The model and prompt version.
- The raw and parsed AI output.
- Reviewer corrections (before and after), approvals with who and when, and the final adjustments.

This is the audit trail; every correction becomes labelled data for measuring accuracy.

## 9. Employee review
One phone screen per location:
- A key frame with the detected cases outlined.
- A table of SKU, system count, video count and difference, with differences first.
- Large buttons: **Accept**, **Edit count**, **Wrong SKU**, **Rescan**.

Matching rows accept in one tap, so attention goes to real differences.

## 10. Prototype first
One aisle. Film it with the protocol, count it by hand, run the analysis and measure accuracy against the hand counts. Then add the review screen, writing only to proposals. Inventory writes come last, once one aisle is proven accurate.
