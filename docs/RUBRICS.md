# Question data and feedback criteria

The TCLA question bank contains 200 numbered prompts and one unnumbered prompt, kept as `17a`. `src/data/questions.ts` retains all 201 entries, source categories, page numbers, and default-draw eligibility. The server independently reads `Practice_Interview_Question_Bank.md`; keep both representations aligned.

The default session draws one eligible question each from **Motivation for Commercial Law**, **Competency Interview Questions**, and **Character and Personality**. Prompts needing missing firm, case, application, or personal-history context remain searchable but are excluded where marked ineligible. Eligibility is a convenience, not an assessment of question quality.

`server/rubric.ts` owns three shared criteria and one category-specific criterion. `docs/COACHING_RUBRIC.md` supplies shared coaching instructions to the content and camera prompts. `src/data/rubrics.ts` is reference material, not a second grader. These are project coaching criteria, not official TCLA marks.

The content review assesses what the answer says, with exact transcript evidence. The camera review describes only supported sampled-image observations. Neither should score personality, honesty, authenticity, or personal suitability. Current legal/commercial claims are not independently verified. See [architecture.md](../architecture.md) for grading, evidence and limitations, and [third-party notices](../THIRD_PARTY_NOTICES.md) for question-bank attribution.
