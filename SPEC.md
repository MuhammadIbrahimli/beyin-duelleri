# Beyin Duelleri — Product Concept and MVP Specification

This document records the original product concept. The implementation has since expanded; use the repository code and [current test catalog](docs/tests-catalog.md) for the shipped feature set.

## Concept

Beyin Duelleri is a short-form web app for Azerbaijani audiences. A person completes a behavioral experiment in about 60–90 seconds, receives a shareable result card, and can challenge a friend using a link.

**Core promise:** “Check your brain and compare with a friend.”  
**Tagline:** *Beynini dostunla yoxla.*

The product is for people interested in short videos about the brain and psychology. The concept assumes that a personal result, a fair comparison, and an easy-to-share card can help the product spread; this is a hypothesis, not a guaranteed growth outcome.

This is not a personality test, diagnosis, or therapy. It consists of short behavioral experiments related to reaction speed, attention, memory, and perception. Results should clearly state that they are not diagnostic.

## Product principles

1. Keep the path to a result short.
2. Make results comparable with a friend, a city, or a player's own previous attempts.
3. Explain what each experiment measures and cite a source.
4. Do not add free-text chat, comments, or anonymous messaging between players.
5. Treat the result card as a first-class product surface.

## Core loop

A player completes an experiment, shares a challenge, and the recipient completes the same experiment. The recipient sees the inviter's result only after finishing, and can then share their own challenge. Group challenges, result cards, rematches, and city comparisons are intended to encourage repeat participation.

For a fair duel, both players receive the same task configuration or seed. Rematches should use a new seed.

## Proposed MVP screens

The original concept described ten screens under four tabs: Experiments, Duels, Rankings, and Passport.

1. **Entry page:** a short message, a “Start” action, the daily experiment, and a list of experiments.
2. **Experiment introduction:** title, a hook, what is measured, and an optional explanatory video.
3. **Experiment:** full-screen task with clear progress and gentle error feedback.
4. **Result:** nickname, level, score, comparison, sharing actions, and a short science explanation.
5. **Create a duel:** a link and share actions for WhatsApp, Telegram, Instagram Stories, and copying the link.
6. **Invitation page:** explain that the inviter's result is hidden until the recipient finishes.
7. **Duel result:** show both players' results, a rematch action, and a group challenge option.
8. **Daily experiment and streak:** one shared daily task and a visible streak.
9. **City rankings:** optional city selection and a minimum cohort before a city appears.
10. **Player passport:** best scores, progress history, and optional badges.

The Azerbaijani interface copy in the original concept needs review by a native speaker before publication.

## Experiments in the original concept

The initial proposal listed six experiments. These are concept descriptions, not necessarily the exact current implementation.

- **Refleks:** median reaction time across five rounds. Device display and touch latency affect the result, so comparisons should account for device differences.
- **Rəng və söz (Stroop):** select the color of the letters rather than the written color word. An accessibility mode can use shapes instead of colors.
- **Yaddaş zənciri:** repeat an increasingly long sequence of highlighted tiles.
- **Yalançı yaddaş:** remember words and identify which were shown, including a related lure word.
- **Eyni rəngdir?:** compare visual stimuli whose context can affect perceived brightness or size.
- **Lövbər:** estimate a factual quantity after seeing a low or high anchor; group results should be reported only after enough responses and checked against a reliable source.

Any scientific claims, task thresholds, translations, and source citations should be verified before use. Short browser tasks are not clinical measurements, and thresholds should be recalibrated using observed data.

## Result cards and duels

The concept proposed portrait cards for Stories and square cards for posts, containing a nickname, result, comparison, brand mark, and a non-diagnostic disclaimer. Use a font that supports Azerbaijani characters.

For duels:

- Reuse the same task seed for both participants.
- Hide the inviter's result until the invited player completes the test.
- Expire individual challenge links after a defined period.
- Provide a rematch with a different seed.
- Show that device differences can affect timing-based tests.

## Daily use and rankings

A daily task rotation, a streak, optional reminders, badges, and group or city rankings were proposed as retention features. City and participant results should be shown with cohort size and a clear warning that the self-selected audience is not a representative demographic sample. Avoid storing GPS or inferring a person's city from IP.

When a score changes over repeated attempts, describe it as a change in performance. Do not claim that a player's brain has improved; practice and familiarity can affect the result.

## Monetization concept

Keep experiments, duels, cards, and rankings free. Potential later options include extra history and card themes, clearly marked sponsored daily experiments, or classroom and university group features. These are hypotheses to validate, not revenue forecasts.

Any advertising should be labeled. Sponsors should receive aggregate data only; do not sell or disclose personal data. Avoid medical, intelligence, or income claims in sponsor content. Check local advertising, privacy, tax, and payment-provider requirements before launching paid features.

## Technical concept

The initial proposal suggested:

- A Progressive Web App so a link opens without an app-store install
- A backend with a relational database and Redis for queues and rate limits
- TypeScript for experiments, using high-resolution browser timing APIs where appropriate
- HTML-to-image generation for consistent result cards
- First-party event analytics and a privacy-conscious analytics counter

These are concept-era design notes. The current implementation uses TypeScript, Vite, Cloudflare Workers, Hono, and Cloudflare D1; see the README for the current local and deployment commands.

## Launch and measurement

The concept prioritized measuring day-one and day-seven return, invitations per player, group participation, and acquisition-source tags. Test links on WhatsApp, Telegram, and other target messengers after deployment. Verify link previews and the behavior on different mobile devices.

Before expanding, verify the actual reach of relevant social and messaging platforms, the spelling of institution and city names, language quality, and consent requirements. Do not promise viral growth or cognitive benefits.