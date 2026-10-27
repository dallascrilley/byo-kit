# Understand and modify {{project}}

## Explain the useful result in one minute

Start with the user and the repeated task. Run the sample, show the result, then use a changed local input. Explain the standout behavior: {{standout}}.

Trace input → validation → useful computation → result/export. Identify what stays local and what an optional model/provider receives. If AI contributes, compare its result with the deterministic baseline and show a mistake or abstention.

## Make a meaningful change

1. Choose an input or scenario beyond the recorded demo. Predict the result before running it.
2. Run it and explain any difference from the prediction.
3. Modify one meaningful behavior or fix a reproducible failure. Add or update an acceptance case that distinguishes the old behavior from the intended result.
4. Explain the decision, one alternative and one tradeoff. Run the relevant check and show the changed output.

Useful scenarios include malformed or missing data, duplicates, a changed threshold, an out-of-order event, or a larger input. Select cases that match this tool's actual contract.

## Capture decisions and progressive evidence

| Question | Concrete answer / runnable evidence |
| --- | --- |
| What user problem does the tool solve? | |
| What did I decide and implement? | |
| What failure did I investigate? | |
| What tradeoff or alternative did I consider? | |
| What meaningful modification can I demonstrate? | |

Keep evidence levels distinct: reproducible sample behavior, a live provider or test environment, independent use, and production adoption. Record a level when observed. Useful verified functionality can ship before independent adoption. Automated artifact checks and a person's ability to explain and change the code are separate observations.
