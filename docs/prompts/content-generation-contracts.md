# Prompt Contracts: LLM Content Generation
> **Version:** v1.1 — aligned with PRD v2.1 / Architecture v1.1
> Used by `ContentGenJob` worker. All contracts specify: system prompt, user prompt template, JSON output schema, validation pipeline, and retry policy.

---

## Execution Context

```
ContentGenJob worker
  → selects contract by (template_id, job_type)
  → builds user prompt from SkillSpec + job parameters
  → calls provider (OpenRouter → OpenAI → curated fallback)
  → runs validation pipeline
  → on pass: stores ContentObject + computes embedding
  → on fail: retries with tighter prompt (max 2 retries)
  → on final fail: returns curated fallback, logs REJECTED
```

---

## Common Rules (All Contracts)

| Rule | Detail |
|---|---|
| **Output format** | JSON only. No markdown fences, no prose, no commentary. |
| **Age appropriateness** | Ages 5–8. No violence, death, sarcasm, adult themes, brand names. |
| **Determinism** | Every generated item must have exactly one correct answer. |
| **Schema conformance** | Output must parse and validate against the contract's output schema. |
| **Retry budget** | Max 2 retries per job. Each retry injects a tighter constraint addendum. |
| **Final failure** | Mark job `REJECTED`. Return nearest curated pool item. Log `validation_report`. |

### Retry Constraint Addendum (injected into user prompt on retry N)

```
[RETRY {{N}}] Previous attempt failed validation:
{{validation_errors}}
Fix ONLY the issues listed. Do not change the content that was already valid.
Stricter requirements for this retry:
- If vocab error: use only these words: {{allowed_vocab_compact}}
- If length error: reduce by {{reduction_pct}}%
```

---

## Contract 1 — `CONTENT_GEN_TAP_CHOICE`

Generates a `TapChoiceItem`: a multiple-choice word/phonics recognition item.

### System Prompt

```
You are a content generator for a children's phonics and reading tutor targeting ages 5–8.
Your output must be a single JSON object conforming exactly to the schema provided.
Do NOT output markdown, code fences, or explanations — JSON only.

Rules:
- All words must come from the provided allowed_vocab list (if given).
- No word may contain any disallowed_grapheme (e.g. "ph", "ch", "sh").
- Every word must be ≤ max_word_length characters.
- There must be EXACTLY ONE correct answer.
- Distractors must come from the same phonics family (same ending or similar onset) but be clearly wrong.
- The prompt_text must ask the child to identify or complete the target word, not explain it.
- Do not use the correct word inside the prompt_text.
```

### User Prompt Template

```
Generate a tap-choice item for:
  skill_id:            {{skill_id}}
  difficulty_level:    {{difficulty_level}} (1–10)
  phonics_patterns:    {{phonics_patterns | join(", ") | default "any CVC"}}
  allowed_vocab:       {{allowed_vocab | join(", ") | default "any age-appropriate CVC word"}}
  disallowed_graphemes:{{disallowed_graphemes | join(", ") | default "none"}}
  max_word_length:     {{max_word_length | default 3}} characters
  choice_count:        {{choice_count | default 3}}
  constraints_hash:    {{constraints_hash}}

Output this exact JSON schema (no other keys):
{
  "type": "tap_choice",
  "prompt_text": "<instruction asking child to identify or match the target>",
  "prompt_audio_key": null,
  "choices": [
    { "choice_id": "A", "label": "<word>", "audio_key": null },
    { "choice_id": "B", "label": "<word>", "audio_key": null },
    { "choice_id": "C", "label": "<word>", "audio_key": null }
  ],
  "correct_choice_id": "<A|B|C>"
}
```

### Validation Pipeline

| Step | Check | On fail |
|---|---|---|
| 1. Schema | JSON parses; all required keys present; types match | → retry |
| 2. Answer key | `correct_choice_id` exists in `choices[].choice_id` | → retry |
| 3. Vocab allowlist | Every `label` is in `allowed_vocab` (if list non-empty) | → retry with addendum |
| 4. Disallowed graphemes | No `label` contains any `disallowed_grapheme` substring | → retry with addendum |
| 5. Length | Every `label` length ≤ `max_word_length` | → retry |
| 6. Choice count | `choices.length` between 2 and 6 | → retry |
| 7. Uniqueness | All `label` values are distinct | → retry |
| 8. Prompt safety | `prompt_text` does not contain any choice label (no answer leakage) | → retry |
| 9. Profanity/safety | None of `prompt_text`, `label` values trigger safety filter | → REJECTED |

### Retry Policy

```
max_attempts: 3
retry_1_addendum: "Allowed vocabulary only: {{allowed_vocab_compact}}"
retry_2_addendum: "Use ONLY these exact words as choices: {{safe_word_subset}}. Do not deviate."
on_exhaust: REJECTED → return nearest curated TapChoiceItem with same skill_id + difficulty_level
```

---

## Contract 2 — `CONTENT_GEN_STORY_PAGE`

Generates a `StoryPage`: a single page of a leveled-reader story with word-span annotations.

### System Prompt

```
You are a children's story writer for ages 5–8.
Generate one page of a short leveled-reader story with word-level annotations for a read-aloud tutor.
Your output must be a single JSON object — no markdown, no prose outside the JSON.

Story rules:
- Use only vocabulary appropriate for the specified reading level.
- If an allowed_vocab list is given, prioritize those words in the story.
- Sentences must be ≤ max_sentence_length words.
- Target word count: between word_count_min and word_count_max.
- Story must be coherent with the previous_pages_summary (if provided).
- No violence, death, or adult themes.
- Every key vocabulary word must appear exactly once in word_spans with is_tappable: true.

Word spans rules:
- word_spans must cover EVERY token in page_text (including punctuation if it forms a token).
- start_index and end_index are character positions in page_text (0-based, end exclusive).
- Verify: page_text[start_index:end_index] === word for every span.
- sound_it_out: provide phoneme segments only for is_tappable words with ≤ 6 letters.
```

### User Prompt Template

```
Generate story page {{page_number}} of {{total_pages}} for:
  skill_id:             {{skill_id}}
  reading_level_range:  {{reading_level_range.min}}–{{reading_level_range.max}} (Flesch-Kincaid grade)
  max_sentence_length:  {{max_sentence_length | default 8}} words
  word_count_min:       {{word_count_min | default 40}}
  word_count_max:       {{word_count_max | default 80}}
  theme:                {{theme | default "a friendly animal and a small adventure"}}
  allowed_vocab:        {{allowed_vocab | join(", ") | default "any age-appropriate words"}}
  constraints_hash:     {{constraints_hash}}
  previous_pages_summary: "{{previous_pages_summary | default "first page — introduce main character"}}"

Output this exact JSON schema:
{
  "type": "story_page",
  "story_id": "{{story_id}}",
  "page_number": {{page_number}},
  "page_text": "<full page text>",
  "read_aloud_ssml": null,
  "word_spans": [
    {
      "word": "<token>",
      "start_index": <int>,
      "end_index": <int>,
      "is_tappable": <bool>,
      "definition": "<≤80 char child-friendly definition, only if is_tappable>",
      "sound_it_out": ["<phoneme>", ...] or null
    }
  ],
  "illustration_key": null
}
```

### Validation Pipeline

| Step | Check | On fail |
|---|---|---|
| 1. Schema | JSON valid; all required keys present | → retry |
| 2. Span coverage | Every word in `page_text` has a corresponding span (`start_index`/`end_index` correct) | → retry |
| 3. Span accuracy | `page_text[span.start_index:span.end_index] === span.word` for every span | → retry |
| 4. No overlaps | No two spans share a character index | → retry |
| 5. Sentence length | No sentence exceeds `max_sentence_length` words | → retry with addendum |
| 6. Word count | `page_text` word count within [`word_count_min`, `word_count_max`] | → retry |
| 7. Reading level | Flesch-Kincaid grade within `reading_level_range` (heuristic: avg sentence length × avg word length coefficient) | → retry with addendum |
| 8. Tappable count | ≥ 3 words marked `is_tappable: true` | → retry |
| 9. Definition length | All definitions ≤ 80 characters | → trim + pass |
| 10. Safety | `page_text` + all definitions pass safety filter | → REJECTED |

### Retry Policy

```
max_attempts: 3
retry_1_addendum: "Your sentences were too long / word count out of range. Rewrite with max {{max_sentence_length}} words per sentence and {{word_count_min}}–{{word_count_max}} total words."
retry_2_addendum: "The story must be simpler. Use only 1-syllable and common 2-syllable words. Maximum sentence length: 6 words."
on_exhaust: REJECTED → return nearest curated StoryPage with same skill_id + difficulty_level
```

---

## Contract 3 — `TALK_PLAN_GEN`

Generates a `TalkPlan`: a bounded, scripted talk sequence for Talk mode inside a `LearningBundle`. **This is offline-only** — called during bundle pre-assembly, never at runtime during a live session.

> **Schema status:** Talk plan full schema is deferred (v1.1 stub). The contract generates a minimal structure with 3–5 scripted exchange pairs. The output is stored as an opaque JSONB blob referenced by `talk_plan_id`.

### System Prompt

```
You are a children's educational tutor assistant scripting a short conversational introduction to a reading skill.
Your output is a talk plan: a sequence of 3–5 scripted exchange pairs (tutor says → expected child response type).
The talk plan introduces the skill concept, gives one worked example, and bridges to practice.
Output ONLY valid JSON. No markdown. No prose outside JSON.

Rules:
- Tutor turns must be ≤ 25 words each.
- Use simple language for ages 5–8.
- Do NOT ask the child to read or spell anything — that happens in Practice mode.
- End with a natural bridge to Practice: "Want to try some?" or similar.
- No open-ended questions — each child response is guided (tap / short word / yes-no).
```

### User Prompt Template

```
Generate a talk plan for:
  skill_id:        {{skill_id}}
  objective:       "{{objective}}"
  difficulty_level: {{difficulty_level}}
  world_id:        {{world_id | default "null"}}
  example_word:    "{{example_word | default first word in allowed_vocab}}"
  constraints_hash: {{constraints_hash}}

Output this exact JSON schema:
{
  "talk_plan_id": "{{talk_plan_id}}",
  "skill_id": "{{skill_id}}",
  "version": 1,
  "exchanges": [
    {
      "turn": 1,
      "tutor_text": "<what the tutor says, ≤25 words>",
      "tutor_audio_key": null,
      "expected_response_type": "acknowledgement | short_word | yes_no | tap_choice",
      "expected_response_hint": "<brief note on what child is expected to say/do>"
    }
  ],
  "bridge_to_practice_text": "<final line bridging to Practice mode, ≤15 words>"
}
```

### Validation Pipeline

| Step | Check | On fail |
|---|---|---|
| 1. Schema | JSON valid; all required keys present; `exchanges` is array of 3–5 items | → retry |
| 2. Turn length | Every `tutor_text` ≤ 25 words | → retry (auto-trim on retry 2) |
| 3. Response types | `expected_response_type` is one of the allowed enum values | → retry |
| 4. Bridge present | `bridge_to_practice_text` non-empty and ≤ 15 words | → retry |
| 5. No reading demand | `tutor_text` does not instruct child to spell, decode, or read a word aloud | → retry with addendum |
| 6. Safety | All `tutor_text` values pass safety filter | → REJECTED |

### Retry Policy

```
max_attempts: 3
retry_1_addendum: "Some tutor turns exceeded 25 words or the bridge was missing. Shorten and add the bridge."
retry_2_addendum: "Use extremely simple language. Each turn: subject + verb + object. Max 15 words per turn."
on_exhaust: REJECTED → use hardcoded default talk plan stub for this skill_id (fill from canned templates)
```

---

## Contract 4 — `NEAR_TRANSFER_GEN`

Generates a near-transfer variant of an existing content item. The new item must address the **same skill** and **same constraints** as the original but use a **different surface form** (different word, different phonics family within the same pattern class).

> **Critical requirement:** The generated item's `constraints_hash` must equal the original item's `constraints_hash` (same `item_generator_rules`). The worker verifies this after generation.

### System Prompt

```
You are a content generator for a children's phonics tutor.
You will be given an ORIGINAL item and must generate a NEAR-TRANSFER variant.
A near-transfer item:
  - Tests the SAME underlying skill (same phonics pattern class, same skill_id)
  - Uses a DIFFERENT surface form (different specific word or word family)
  - Has the same format (same template_id) and same difficulty level
  - Is NOT a copy or minor rewording of the original
  - Must satisfy exactly the same item_generator_rules constraints as the original

Output ONLY valid JSON matching the template schema. No markdown. No prose.
```

### User Prompt Template

```
Generate a near-transfer variant for:
  skill_id:          {{skill_id}}
  template_id:       {{template_id}}
  difficulty_level:  {{difficulty_level}}
  constraints_hash:  {{constraints_hash}}

ORIGINAL ITEM (do NOT copy this — generate something different):
{{original_item_json}}

item_generator_rules (must be satisfied):
  phonics_patterns:     {{phonics_patterns | join(", ")}}
  allowed_vocab:        {{allowed_vocab | join(", ")}}
  disallowed_graphemes: {{disallowed_graphemes | join(", ") | default "none"}}
  max_word_length:      {{max_word_length | default 3}}

Requirements:
  - The TARGET word must be DIFFERENT from the original item's target word.
  - The TARGET word must come from a different sub-family within the same pattern
    (e.g. if original was "-at" family, use "-og" or "-ug" family, NOT another "-at" word).
  - Distractors must also be from allowed_vocab and must differ from the original distractors.

Output the same JSON schema as the original item's template_id.
```

### Validation Pipeline

| Step | Check | On fail |
|---|---|---|
| 1. Schema | JSON valid; all required keys for `template_id` present | → retry |
| 2. Not a copy | `correct_choice_id` label ≠ original item's correct label; prompt_text differs | → retry with addendum |
| 3. Vocab allowlist | All words in `allowed_vocab` | → retry |
| 4. Disallowed graphemes | No word contains any disallowed grapheme | → retry |
| 5. Length | All words ≤ `max_word_length` | → retry |
| 6. Constraints hash match | Worker recomputes hash from `item_generator_rules`; must equal `constraints_hash` | enforced by worker (not LLM) |
| 7. Answer key | `correct_choice_id` exists in `choices[]` (for tap_choice) | → retry |
| 8. Surface form delta | Target word from a different phonics sub-family than original (heuristic: different word ending) | → retry with addendum |
| 9. Safety | All text values pass safety filter | → REJECTED |

### Retry Policy

```
max_attempts: 3
retry_1_addendum: "Your output was too similar to the original. The target word MUST be from a different word family. Original target: '{{original_target}}'. Forbidden word families: {{original_families}}."
retry_2_addendum: "Use ONLY these words as choices: {{safe_alternative_words}}. Target must be '{{forced_target}}'."
on_exhaust: REJECTED → select next available curated ContentObject with same skill_id + difficulty_level + content_id ≠ original
```

---

## Provider Configuration

```json
{
  "primary": {
    "provider": "openrouter",
    "endpoint": "https://openrouter.ai/api/v1/chat/completions",
    "model": "google/gemini-2.0-flash-001",
    "temperature": 0.3,
    "max_tokens": 1024,
    "response_format": { "type": "json_object" }
  },
  "fallback": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.3,
    "max_tokens": 1024,
    "response_format": { "type": "json_object" }
  }
}
```

> **Temperature 0.3:** Low temperature gives more consistent, constraint-obeying output. Slightly > 0 maintains vocabulary variety. Do not increase above 0.5 — higher temps increase constraint violation rate.

### Fallback Chain

| Priority | Condition | Action |
|---|---|---|
| 1 | Normal | OpenRouter (primary model) |
| 2 | OpenRouter error / `REJECTED` after 3 retries | OpenAI fallback with same prompt |
| 3 | OpenAI also fails or rejects | Curated pool — return nearest ContentObject by `(skill_id, template_id, difficulty_level)` |
| 4 | Curated pool empty | Return `null`; session proceeds with existing queue items; schedule job for later |

---

## ContentGenJob State Flow

```
PENDING
  → worker picks up job
RUNNING (attempt 1)
  → call LLM
  → run validation pipeline
  → if pass → SUCCEEDED → store ContentObject → compute embedding
  → if fail → retry (attempt 2)
RUNNING (attempt 2)
  → inject retry_1_addendum
  → call LLM
  → validate
  → if pass → SUCCEEDED
  → if fail → retry (attempt 3)
RUNNING (attempt 3)
  → inject retry_2_addendum
  → call LLM
  → validate
  → if pass → SUCCEEDED
  → if fail → REJECTED → use curated fallback
FAILED
  → unrecoverable error (network, parse crash)
```

All state transitions, validation reports, raw LLM output, and token counts are stored in `content_gen_jobs` table.
