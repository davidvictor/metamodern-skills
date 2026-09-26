# Automotive Engineering Language

Use this dictionary when a thought concerns a vehicle's technical architecture, physical behavior, systems, production, or evidence. It helps all four Prompt modes keep requirements, hypotheses, tradeoffs, and proof distinct. It is not a design calculation, safety case, tuning specification, or compliance assessment.

## Work areas and boundaries

| Work area | Use when the intent concerns |
| --- | --- |
| Vehicle architecture | The arrangement and interfaces of major vehicle systems and volumes |
| Vehicle dynamics | How the vehicle responds in motion, including steering, braking, ride, handling, tires, and control systems |
| Structures | Body, chassis, joints, load paths, stiffness, crash-related engineering, and material behavior |
| Powertrain and energy | Energy source, conversion, propulsion, storage, charging or fueling, and delivery to the wheels |
| Thermal engineering | Heat generation, transfer, rejection, cabin conditioning, and temperature-dependent performance |
| Electrical/electronic and software | Power distribution, sensors, actuators, networks, controls, software, and diagnostics |
| NVH | Noise, vibration, and harshness as experienced and measured through the vehicle |
| Manufacturing and serviceability | How the vehicle is assembled, inspected, repaired, maintained, and accessed over its life |

Engineering asks how a vehicle can meet stated needs under stated conditions. Automotive design asks how it is expressed and experienced; use [Automotive Design](automotive-design.md) when form, CMF, packaging expression, or HMI intent leads. Neither domain should infer regulatory status or safety compliance from an appearance, concept, component label, or a standard's abstract.

## Systems and coupled tradeoffs

| Term | Meaning and useful distinction |
| --- | --- |
| Architecture | The system arrangement and interfaces that shape later choices; it is not a final component selection |
| Requirement | A stated need or condition to be met, with an owner and evidence when known; an aspiration can remain an aspiration |
| Constraint | A limit that bounds choices, such as space, cost, mass, timing, or an interface; it is not automatically a requirement |
| Tradeoff | A choice that improves one valued outcome while affecting another; list the affected outcomes rather than assuming one optimum |
| Interface | The defined interaction between parts, systems, teams, or users; a shared physical location alone is not a complete interface |
| Traceability | A visible link among need, requirement, design choice, implementation, and evidence; it does not prove the result is correct |
| Operating condition | The environment, duty cycle, load, temperature, speed, road, user behavior, or state that gives a claim meaning |
| Failure mode | A way a system or function could cease to provide intended behavior; identifying one does not establish risk acceptance or mitigation |
| Serviceability | Access, diagnosis, replacement, repair, and maintenance over time; it is distinct from manufacturing ease |

## Technical areas without implied outcomes

| Area | Useful language and boundary |
| --- | --- |
| Dynamics | Response, grip, stability, ride, braking, steering feel, and predictability are different outcomes. “Better handling” needs a condition and priority. |
| Structure | Stiffness, strength, mass, durability, and crash performance are distinct. A rigid-looking form demonstrates none of them. |
| Powertrain / energy | Source, storage, conversion, propulsion, efficiency, thermal behavior, and range or endurance depend on conditions; do not infer figures. |
| Thermal | Component temperatures, heat paths, cooling, heating, and cabin comfort are coupled but not interchangeable. |
| E/E and software | Hardware, networks, sensing, control logic, software update behavior, diagnostics, and cybersecurity have different responsibilities. |
| NVH | Includes subjective qualities and measurable phenomena. A quiet concept image does not establish acoustic performance. |
| Manufacturing | Process capability, assembly sequence, tolerances, supplier readiness, quality checks, and cost can all matter separately. |

## Evidence and development language

| Term | Meaning and useful distinction |
| --- | --- |
| Model / simulation | A representation used to reason or predict under stated assumptions; output is not physical proof by itself |
| Prototype / test article | A build used to learn about selected questions; it need not represent production intent in every respect |
| Verification | Checking whether a specified requirement was met; it differs from asking whether the right need was addressed |
| Validation | Assessing whether the solution serves its intended use or need in the relevant context; it differs from verification |
| Test evidence | Observations from a stated method and condition; preserve its scope, uncertainty, and pass criterion |
| Release readiness | A decision about whether specified gates are satisfied; it cannot be inferred from a demonstration or one test |

## Translate the desired effect

| Rough expression | Possible precise language when context supports it |
| --- | --- |
| “It needs to handle better.” | Identify the desired motion behavior, operating condition, and priority among response, grip, stability, predictability, and ride; leave targets open |
| “Make the platform more flexible.” | Explore which interfaces, packaging regions, energy systems, or software boundaries need variation; do not assume modularity solves every constraint |
| “It should be easy to repair.” | Improve access, diagnosis, replacement, and maintenance for named service tasks; preserve available tooling, parts, and safety constraints as unknowns if absent |
| “More efficient.” | Clarify which resource and duty cycle matter: energy use, thermal loss, mass, manufacturing input, time, or cost |
| “Production-ready.” | Identify the particular readiness evidence needed for manufacturing, quality, service, supply, or release; do not treat a prototype as proof |
| “Safe by design.” | State the relevant hazard, operating context, responsibility, and evidence needed; do not infer compliance with ISO 26262 or other standards |

## Questions for expansion

Expand from the stated decision rather than a universal engineering checklist. A thermal concern might open system architecture, an operating condition that creates the issue, and the evidence needed to compare alternatives. A platform question might open shared interfaces, variation needs, and manufacturing or service consequences.

For an interdisciplinary prompt, Combine can preserve a shared chain: design intent -> relevant constraints -> tradeoffs -> owner -> evidence. Keep user-provided data distinct from assumptions, scenarios, and hypotheses. A question about the design's appearance remains a design question until a technical consequence is explicitly in scope.

## Evidence boundaries and primary sources

Do not manufacture dimensions, loads, duty cycles, performance values, material selections, tuning settings, test outcomes, safety claims, or compliance conclusions. ISO 26262 describes a functional-safety standard's scope; citing it does not establish a vehicle's compliance or overall safety. The sources below supply systems-engineering and modeling vocabulary, not project-specific proof.

- [SAE International, "Why Have a Systems Engineering (SE) Capability for Automotive Product Development? - Questions and Answers"](https://saemobilus.sae.org/papers/a-systems-engineering-se-capability-automotive-product-development-questions-answers-2007-01-0782), accessed 2026-09-26.
- [SAE International, *J2940_202002: Use of Model Verification and Validation in Product Reliability and Confidence Assessments*](https://saemobilus.sae.org/standards/j2940_202002-use-model-verification-validation-product-reliability-confidence-assessments), accessed 2026-09-26.
- [ISO, *ISO 26262-5:2018 Road vehicles - Functional safety - Part 5: Product development at the hardware level*](https://www.iso.org/standard/68387.html), accessed 2026-09-26.
