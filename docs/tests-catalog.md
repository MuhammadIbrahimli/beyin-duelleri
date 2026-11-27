# Experiment Catalog by Category

This catalog lists experiments already in the app and candidates from open experiment libraries. Candidates are not validated merely because they appear here: implement each one, choose scoring thresholds, and test it with people before including it in Beyin balı.

Sources are references to experimental paradigms, not code. The project writes its own code and does not copy GPL-licensed PEBL code or PsyToolkit's library.

- [PsyToolkit experiment library](https://psytoolkit.org/experiment-library) — more than 50 paradigms, including Corsi, N-back, Flanker, Simon, SART, PVT, Navon, mental rotation, Tower of Hanoi, and Wisconsin tasks.
- [PEBL test battery](https://pebl.sourceforge.net/battery.html) — roughly 50–70 tests, including Wisconsin, Trail Making, Tower of London, and Iowa Gambling Task.

**Statuses:** **available** means already in the app; **next** means considered for the next batch; **later** means deferred.

## Yaddaş (Memory)

| Test | Paradigm | Status | 60-second idea |
| --- | --- | --- | --- |
| Yaddaş zənciri | Corsi-like block span | Available | Remember the order of tiles |
| Yalançı yaddaş | DRM false memory | Available | Remember words, then identify which ones appeared |
| Rəqəm yaddaşı | Digit span | Available | Remember and enter a sequence of digits |
| Reverse digit span | Digit span backward | Available | Enter the same digits in reverse |
| Operation span | Automated Operation Span | Next | Solve a math problem and remember a letter; recall the letters in order |
| N-back (2-back) | N-back | Available | Tap when the current letter matches the one from two steps earlier |
| Word list | Free recall | Later | Remember 12 words and type as many as you can recall |

## Diqqət (Attention and Control)

| Test | Paradigm | Status | 60-second idea |
| --- | --- | --- | --- |
| Rəng və söz | Stroop | Available | Name the letter color, not the written word |
| Toxun, ya yox | Go/No-Go | Available | Tap green, do not tap red |
| Flanker | Eriksen Flanker | Available | Respond to the center arrow among distractors |
| Simon | Simon task | Available | Choose left or right based on color, not screen position |
| SART | Sustained Attention to Response | Available | Tap every number except three |
| Target search | Visual search | Later | Find one unusual item among similar items |
| Attention network test | Attention Network Test | Later | A cue shows where to expect the target |

## Sürət (Speed)

| Test | Paradigm | Status | 60-second idea |
| --- | --- | --- | --- |
| Refleks | Simple reaction time | Available | Tap when the screen turns green |
| Symbols and digits | Digit Symbol Substitution (DSST) | Available | Use a key to match symbols to digits for 60 seconds |
| Psychomotor vigilance | PVT | Available | Wait for a random signal and tap as quickly as possible |
| Two-choice response | Two-choice reaction time | Later | Quickly choose a left or right response |

## Qavrayış (Perception)

| Test | Paradigm | Status | 60-second idea |
| --- | --- | --- | --- |
| Eyni rəngdir? | Luminance contrast, Müller-Lyer, Ebbinghaus | Available | Decide whether two objects are the same |
| Global and local | Navon | Available | See the large letter or the small letters that form it |
| Mental rotation | Shepard–Metzler mental rotation | Available | Decide whether two shapes match after rotation |
| Scene change | Change detection | Later | Find what changed between two images |
| Ponzo, Hermann grid | Classic illusions | Later | Use carefully; similar illusions already appear in Eyni rəngdir? |

## Düşüncə (Reasoning and Decisions)

| Test | Paradigm | Status | 60-second idea |
| --- | --- | --- | --- |
| Lövbər | Anchoring effect | Available | Estimate a number after seeing different anchors |
| Tower of Hanoi | Tower of Hanoi | Available | Move disks in as few steps as possible |
| Rule switching | Dimensional Card Sorting / Wisconsin | Next | Infer a sorting rule from feedback and then switch |
| Task switching | Task switching | Available | Alternate two rules for the same card |
| Ball and bat | Bat-and-ball / reflective reasoning | Later | Short problems where the intuitive answer is wrong |
| Balloon | BART risk task | Later | Inflate a balloon for a higher reward while risking a pop |
| Card game | Iowa Gambling Task | Later | A longer task that does not fit a 60-second session |

## Catalog size

- The earlier catalog listed 19 available tests.
- The next batch listed nine candidates, one to three in each category.
- The catalog had about 25 slots at that time. Reaching 10–20 per category would require two or three more batches, and suitable paradigms exist.

## Limitations

- Many paradigms lose reliability when shortened to 60 seconds. Standard library versions often take 5–15 minutes, so short versions need user testing.
- Initial thresholds and scores in `config/points.ts` need recalibration using collected data.
- Azerbaijani and Russian test names have not all been reviewed by native speakers.

## Mechanics and duplicates

Rule: each test should use one distinct mechanic. The mapping lives in `shared/mechanisms.ts`; the type requires a mapping for every test, and `tests/features.test.ts` fails when a mechanic is duplicated.

The 2025-11 audit removed duplicates: Flanker and Simon (conflict like Stroop), Navon (the same global/local conflict pattern), SART (a Go/No-Go variant), PVT (simple reaction like Refleks), and reverse digit span (a span task like Rəqəm yaddaşı).

Corsi-like spatial span and digit span remain separate because they use spatial and verbal memory stores. If they are considered duplicates, remove one. Card sorting was not added because it is closest to the existing rule-switching test.

## Recent additions

- Free word recall (`word-recall`, memory): recall words from language-specific sets without cues.
- Attentional blink (`attentional-blink`, attention): detect two digits in a stream of letters.
- Syllogisms (`syllogism`, reasoning): draw a symbolic conclusion without relying on word meaning.
- Mental arithmetic (`mental-arithmetic`, speed): solve timed calculations.

## Recent perception additions

- Random-dot motion direction (`random-dot-motion`).
- Numerosity (`numerosity`): small quantities are perceived immediately; larger ones are estimated.

## Screen check

All 28 `/play/<slug>` routes opened in a browser and rendered the game screen without console errors. Each experiment was not manually completed end to end.

## Recent tasks: perception and decisions

- Line bisection (`line-bisection`, perception): report percentage error and left/right bias.
- Iowa Gambling (`iowa-gambling`, reasoning): learn from outcomes of four decks; score is net gain.
- Pitch discrimination (`pitch-discrimination`, perception): requires audio and begins with a Start button. Results depend on speakers or headphones.

Verbal fluency was deferred because it needs a dictionary to validate responses.

## Current total: 55 of 60 target tests

The goal was 12 tests per category. Remaining gaps listed in the source notes were memory (1), attention (3), and speed (1). Those mechanics either require content that is not available (such as a full dictionary or face images) or duplicate existing tests, so they were not added.

**Caveats:** verbal fluency currently checks only word form because there is no dictionary; flicker tasks are limited by screen refresh rate (about 30 Hz); flash order and sound localization depend on the device; and in card, pair, Posner, MOT, and several other tasks, some answers are visible to the client, as is common in feedback-based tests.