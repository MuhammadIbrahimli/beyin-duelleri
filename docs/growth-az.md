# Growth Plan for Azerbaijan

No product can guarantee that it will “take off” nationally. This document lists hypotheses that may improve the chances and facts that still need validation.

## What is known and unknown

- Instagram and Facebook are broad-reach platforms in Azerbaijan. The previous draft cited third-party audience estimates for December 2025; treat them as advertising-tool estimates, not verified user counts. The cited source was NapoleonCat's Azerbaijan social-media statistics.
- The previous draft's TikTok figure came from early 2024 and is stale for current planning.
- The draft did not verify WhatsApp or Telegram audience figures. Check national ICT statistics or a recent DataReportal report before choosing a messaging channel.
- Tea-house and social-game settings appear in anecdotal sources, but the draft did not find local student research confirming a particular game genre. Optimize for the broader social pattern rather than assuming a specific activity.

## Product behaviors that may help

1. **Challenge a familiar person:** a classmate or friend may matter more than a country-wide leaderboard.
2. **Keep sessions short:** a one-minute test can fit between classes or while waiting.
3. **Give people something to share:** the result card and link preview should make sense without explanation.
4. **Support existing groups:** classmates, university courses, neighborhoods, and friend groups can share one challenge.
5. **Create a daily ritual:** one shared daily challenge and a streak can encourage return visits.
6. **Make team comparison fun:** compare a course or group with another group.

## Already implemented in the previous draft

- Duel and group links show the inviter's name, score, and invitation in messaging apps that support Open Graph previews. The cited implementation was `worker/share.ts`; the draft noted that the preview image was still generic.
- Groups use a shared code and leaderboard.
- A daily task and streak are implemented.

Check the current code before relying on these status notes.

## Priorities by expected impact

1. **University groups:** provide a self-described institution or course group and a share code. Verify institution names and acronyms. Do not imply verified student status if none is collected.
2. **Daily group challenge:** give group members the same task on a given day and show the group's result later.
3. **Story card:** add a 1080×1920 result image with an invitation to join a group.
4. **Reminders:** Web Push has limitations on iPhone and may require installing the PWA. Check actual reach before building a Telegram reminder bot.
5. **Source-tagged links:** use separate `?s=` tags for institutions, groups, and creators.
6. **Student ambassadors:** test a small group of students across several universities, each sharing a group and a short result video.
7. **Sponsored challenge:** consider it after the product has meaningful active usage, with clear `Sponsorlu` labeling.

## Simplify

- Reduce first-run explanations to one sentence and a clear start button.
- Keep the Passport screen manageable; move secondary settings out of the primary flow.
- Present the daily test and a few categories first, with the full catalog available by category.
- Avoid IQ or diagnostic language. Explain that results are game performance, not a diagnosis.

## Avoid

- Paid subscriptions before testing demand.
- Unsupported claims about brain performance.
- Bulk messaging or contact imports without consent.

## Measure

- Day-one and day-seven retention
- Invitations sent and visitors arriving through invitation links
- The share of users who join a group
- Acquisition-source tags for each channel and ambassador

## Verify before acting

- Current messaging-platform reach in Azerbaijan
- University names and any rules for student groups
- Link previews in WhatsApp, Telegram, and iMessage after deployment