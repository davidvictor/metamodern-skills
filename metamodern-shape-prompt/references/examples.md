# Mode examples

These are miniature calibration examples, not a response template or fixed set of three angles. In actual use, Expand returns three complete standalone prompts, carrying relevant context and constraints into each. Clarify returns one faithful prompt; classification is optional when useful.

## Material feel without an invented specification

Seed: "I want the hoodie heavy but not stiff, and the cuffs shouldn't get loose. I don't know the right fabric."

Clarify: "I want the hoodie to feel heavy without being stiff, with cuffs that retain their shape instead of stretching loose. I don't know which fabric would give me that result."

Useful Expand directions:

- Explore how weight, hand, body, and drape contribute to the desired feel without prescribing a fabric weight or fiber.
- Clarify what shape retention should mean in use, distinguishing the desired behavior from its possible material or construction causes.
- Develop a way to compare material samples against the tactile intent while leaving the selection open.

Failure: naming a GSM, fiber blend, or rib structure as though the user chose it. Expansion can ask about possible specifications; it cannot silently establish them.

## Evidence before a redesign

Seed: "I think onboarding overwhelms people. We haven't interviewed anyone. I don't want to assume we need a redesign."

Clarify: "I suspect our onboarding may overwhelm people, but we haven't interviewed users yet. I want to understand their experience before deciding whether a redesign is warranted."

Useful Expand directions: distinguish competing explanations for the suspected difficulty; frame non-leading questions about actual experience; examine how onboarding demands relate to what users came to accomplish.

Failure: stating that cognitive overload causes abandonment, or making all three prompts variations of a redesign brief.

## Commercial pressure without invented numbers

Seed: "We're busy but still short of cash. I want to understand what's happening before raising prices."

Clarify: "We're busy but still short of cash. I want to understand the relationship between our workload and cash position before deciding whether to raise prices."

Useful Expand directions: explore timing between work, invoicing, and collection; distinguish activity from economic contribution; examine what evidence would support or challenge a pricing explanation.

Failure: asserting low margins, late-paying clients, a rate increase, or a pricing recommendation without evidence.

## Emotional meaning without a diagnosis

Seed: "I want to tell my collaborator I'm tired of chasing everything, but I don't want to sound like I'm attacking them."

Clarify: "I want to tell my collaborator that I'm tired of having to chase everything, while making the concern clear without attacking them."

Useful Expand directions: describe concrete patterns and their impact; explore expectations about ownership and follow-through; frame a conversation that makes room for both perspectives without minimizing frustration.

Failure: diagnosing avoidance or manipulation, inventing incidents, or replacing frustration with bland politeness.

## An exploratory idea without a business brief

Seed: "I keep thinking a place can feel familiar even when you've never been there. I want to write about that, but I'm not sure what I mean yet."

Clarify: "I want to write about how a place can feel familiar even when you've never been there. I'm not yet sure what creates that feeling or exactly what I want to say about it."

Useful Expand directions: explore sensory associations; consider familiarity learned through stories or images; examine the tension between belonging and strangeness.

Failure: inventing a childhood memory, presenting a psychological explanation as fact, or forcing the thought into a target audience and content strategy.

## Furniture appearance without a construction decision

Seed: "I want the table to feel sculptural but not take over the room. Keep the rounded top. I'm not sure whether the base is too bulky."

Clarify: "I want the table to feel sculptural without dominating the room, while keeping the rounded top. I'm not sure whether the base has too much visual mass."

Useful Expand directions: explore how the base and rounded top relate as a composition; examine how scale and negative space affect the table's presence in the room; clarify what sculptural presence means without equating it with bulk. Keep the rounded top and uncertainty about the base in each prompt.

Failure: changing the top, declaring the base structurally inadequate, assigning a historical style, or specifying a replacement material, dimensions, or fabrication method.

## Combine all while retaining a collection

Request: “Combine all three onboarding research prompts. One examines customer expectations; two studies the timing of required questions; three considers business and support needs. Keep email required. We haven't interviewed users. I want separate research documents with an index, not a redesign.”

Combined prompt: “I want to understand whether our onboarding asks for the right information at the right time. Examine customer expectations, when required questions become useful, and the business and support needs those questions serve. Keep email required, and treat user difficulty as a hypothesis because we haven't interviewed users. Produce separate research documents for these perspectives, with an index connecting their findings. Use the research to inform a later decision; do not redesign onboarding.”

Failure: dropping the business perspective, claiming users are overwhelmed, replacing the collection with one report, or authorizing implementation.

## Weight a combination and expose a contradiction

Request: “Use the customer-experience prompt as the foundation. Add only the cost comparison from the operations option. One source says keep email required; another says remove email entirely. I haven't decided.”

Response behavior: preserve the customer focus and selected cost comparison. If the task is exploration, frame email requirements as an explicit comparison. If the task demands one implementation, ask which email policy to use. Do not silently select a policy or include the operations option's unrelated implementation work.

## Prepare a substantial investigation

Seed: “Prepare this for Astra: investigate the failing checkout tests in this repository, fix causes within checkout, and show the evidence. No deployment or unrelated refactoring.”

Prepared prompt: “Investigate the failing checkout tests in this repository and fix causes within the checkout scope. Preserve the deployment boundary and avoid unrelated refactoring. Use the observed failures to choose the next action, and report the relevant checks and their results. For work spanning several steps, maintain progress and blockers using the existing task mechanism. Delegate bounded independent investigation only if subagents are available and useful, then integrate their findings. Complete the authorized work before reporting success; if evidence cannot be obtained or a fix requires a change outside checkout, explain the blocker and the decision needed.”

Failure: selecting a database, promising all repository tests pass, enabling a runtime setting by assertion, or starting to inspect the repository while writing the prompt.

## Keep simple preparation simple

Seed: “Prepare a prompt asking an assistant to give me five plain-language alternatives to the heading ‘Start your journey’. This is for a project setup screen.”

Prepared prompt: “Give me five plain-language alternatives to ‘Start your journey’ for a project setup screen. Keep them concise and clear about starting a project.”

Failure: adding a task ledger, subagent team, research phase, or testing framework.
