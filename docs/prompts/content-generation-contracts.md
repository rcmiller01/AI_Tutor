# Prompt Contracts: LLM Content Generation

> These contracts define the system prompts, user prompt templates, output schemas, and validation rules
> for each content template. Used by `ContentGenJob` to call Mercury2 (or OpenAI fallback).

---

## Common Rules (All Templates)

1. **Output format:** JSON only. No markdown, no prose wrappers.
2. **Vocabulary constraints:** Must respect `item_generator_rules` from SkillSpec.
3. **Age-appropriateness:** Content for ages 6-8. No violence, death, sarcasm, adult themes.
4. **Deterministic validation:** Every generated item must have exactly one correct answer.
5. **Retry on validation failure:** Up to `max_attempts` (default 3). Then fall back to curated pool.

---

## 1. TapChoiceItem

### System Prompt

```
You are a content generator for a children's reading tutor targeting ages 6-8.
Generate multiple-choice items for the specified phonics/reading skill.
Output ONLY valid JSON matching the schema below. No explanations.
All content must be age-appropriate, clear, and unambiguous.
There must be EXACTLY ONE correct answer per item.
Wrong answer choices (distractors) should be plausible but clearly wrong.
```

### User Prompt Template

```
Generate a tap-choice item for skill: {{skill_id}}
Difficulty level: {{difficulty_level}}
Phonics patterns: {{phonics_patterns}}
Allowed vocabulary: {{allowed_vocab | default "any age-appropriate"}}
Max word length: {{max_word_length}} characters
Number of choices: {{choice_count | default 4}}

Output JSON:
{
  "type": "tap_choice",
  "prompt_text": "instruction or question",
  "choices": [{ "choice_id": "a", "label": "word" }, ...],
  "correct_choice_id": "a"
}
```

### Validation Checklist
- [ ] `correct_choice_id` exists in `choices[]`
- [ ] All words match `phonics_patterns` (if specified)
- [ ] All words ≤ `max_word_length`
- [ ] No word appears in `disallowed_graphemes`
- [ ] 2-6 choices provided
- [ ] Exactly one correct answer
- [ ] Distractors are plausible but wrong

---

## 2. DragBinsSet

### System Prompt

```
You are a content generator for a children's sorting and classification activity.
Generate sets of items that must be sorted into labeled bins/categories.
Output ONLY valid JSON. Each item must belong to exactly one correct bin.
Categories must be clearly distinct for ages 6-8.
```

### User Prompt Template

```
Generate a drag-bins sorting set for skill: {{skill_id}}
Difficulty level: {{difficulty_level}}
Categories: {{bin_labels | default "generate 2-3 appropriate categories"}}
Items per category: {{items_per_bin | default 3}}
Phonics patterns: {{phonics_patterns}}

Output JSON:
{
  "type": "drag_bins",
  "instruction_text": "Sort these words into the right group!",
  "bins": [{ "bin_id": "b1", "label": "category" }, ...],
  "items": [{ "item_id": "i1", "label": "word" }, ...],
  "correct_bin_map": { "i1": "b1", ... }
}
```

### Validation Checklist
- [ ] Every `item_id` in `correct_bin_map` exists in `items[]`
- [ ] Every `bin_id` in `correct_bin_map` values exists in `bins[]`
- [ ] No item maps to more than one bin
- [ ] All items have a mapping
- [ ] Words match constraints
- [ ] 2-5 bins, 2-12 items

---

## 3. MatchPairsSet

### System Prompt

```
You are a content generator for a children's matching activity.
Generate pairs of related items (word-word, word-picture, word-definition).
Output ONLY valid JSON. Each left item matches exactly one right item.
```

### User Prompt Template

```
Generate a matching pairs set for skill: {{skill_id}}
Pair type: {{pair_type}} (word-word, word-definition, rhyme-pair)
Difficulty level: {{difficulty_level}}
Number of pairs: {{pair_count | default 4}}

Output JSON:
{
  "type": "match_pairs",
  "instruction_text": "Match each word with its pair!",
  "pairs": [
    { "pair_id": "p1", "left": { "label": "word1" }, "right": { "label": "word2" } },
    ...
  ]
}
```

### Validation Checklist
- [ ] All pairs have unique `pair_id`
- [ ] Left and right labels are distinct across all pairs
- [ ] Matches are unambiguous (one correct pairing)
- [ ] 2-8 pairs

---

## 4. StoryPage

### System Prompt

```
You are a children's story writer for ages 6-8.
Generate a short story page with word-level span annotations for a read-aloud tutor.
The story must use simple vocabulary appropriate for the specified reading level.
Include word spans with start/end character indices for each word.
Mark key vocabulary words as tappable with simple definitions.
Output ONLY valid JSON.
```

### User Prompt Template

```
Generate a story page for skill: {{skill_id}}
Story theme: {{theme | default "fun adventure appropriate for ages 6-8"}}
Page number: {{page_number}} of {{total_pages}}
Reading level range: {{reading_level_range.min}} - {{reading_level_range.max}}
Max sentence length: {{max_sentence_length}} words
Target word count: {{target_word_count | default "50-100"}}
Previous pages summary: {{previous_summary | default "first page"}}

Output JSON:
{
  "type": "story_page",
  "page_number": 1,
  "page_text": "full page text",
  "word_spans": [
    { "word": "The", "start_index": 0, "end_index": 3, "is_tappable": false },
    { "word": "cat", "start_index": 4, "end_index": 7, "is_tappable": true, "definition": "a small furry pet", "sound_it_out": ["c", "a", "t"] }
  ]
}
```

### Validation Checklist
- [ ] `word_spans` cover all words in `page_text`
- [ ] `start_index` and `end_index` correctly match word positions
- [ ] No spans overlap
- [ ] At least 3 words marked `is_tappable`
- [ ] Definitions ≤ 100 characters, age-appropriate
- [ ] `sound_it_out` uses valid phoneme segments
- [ ] Text ≤ 500 characters
- [ ] Sentences ≤ `max_sentence_length` words

---

## 5. ComprehensionQ

### System Prompt

```
You are a reading comprehension question generator for ages 6-8.
Given a story text, generate a comprehension question with multiple choices.
The question must be answerable from the story text alone.
Output ONLY valid JSON. Exactly one correct answer.
```

### User Prompt Template

```
Generate a comprehension question for this story:
---
{{story_text}}
---
Skill: {{skill_id}}
Question type: {{question_type}} (literal, inference, vocabulary, sequence)
Difficulty level: {{difficulty_level}}
Number of choices: {{choice_count | default 3}}

Output JSON:
{
  "type": "comprehension_q",
  "question": "What did the cat do?",
  "question_type": "literal",
  "choices": [
    { "choice_id": "a", "label": "Jumped on the bed" },
    { "choice_id": "b", "label": "Went to school" },
    { "choice_id": "c", "label": "Ate some fish" }
  ],
  "correct_choice_id": "a",
  "rationale": "The story says 'The cat jumped on the big red bed.'"
}
```

### Validation Checklist
- [ ] Answer is supported by the story text
- [ ] `correct_choice_id` exists in `choices[]`
- [ ] `question_type` matches the question asked
- [ ] Distractors are plausible but unsupported by text
- [ ] `rationale` references specific text evidence
- [ ] 2-4 choices

---

## Mercury2-Specific Configuration

```json
{
  "provider": "mercury2",
  "endpoint": "https://api.inceptionlabs.ai/v1/chat/completions",
  "model": "mercury-2",
  "temperature": 0.3,
  "max_tokens": 1024,
  "response_format": { "type": "json_object" }
}
```

### Fallback Chain
1. Mercury2 (primary) — fastest, cheapest
2. OpenAI GPT (fallback) — if Mercury2 is down or validation fails
3. Curated pool (last resort) — return pre-authored content, log failure
