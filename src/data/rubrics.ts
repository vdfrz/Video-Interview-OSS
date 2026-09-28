/**
 * Content-review criteria informed by the supplied interview-review notes.
 * These are coaching prompts, not an official TCLA scoring rubric.
 */
export const rubrics = {
  "Motivation for Commercial Law": [
    "Answer why commercial law directly, distinguishing it from a general interest in law or a summary of experience.",
    "Explain a personal reason for the interest and, where useful, what a relevant experience showed you.",
    "Connect the reason to the work or contribution you want to pursue; experience and skills support the answer but do not replace motivation.",
    "Use clear, specific language that addresses this question; an anecdote or fixed answer formula is optional.",
  ],
  "Character and Personality": [
    "Respond to the particular personal prompt with relevant, concrete detail.",
    "Explain the candidate's own choices, perspective, or reflection where the question calls for it.",
    "Keep the answer understandable and proportionate to the prompt.",
    "Do not infer or score personality, honesty, authenticity, or suitability as a person.",
  ],
  "Motivation and Firm Knowledge": [
    "Address the named firm's role, work, or features that the prompt asks about.",
    "Support firm-specific claims with relevant research and explain why the information matters to the candidate or client.",
    "Distinguish verified details from assumptions, and check time-sensitive claims against current sources.",
    "Do not treat a polished firm summary as a substitute for the personal reason asked for.",
  ],
  "Competency Interview Questions": [
    "Give a specific example that fits the competency or situation in the question.",
    "Make the candidate's own actions and reasoning clear, especially where other people were involved.",
    "State the outcome and, when relevant, what was learned or would be changed.",
    "Use a structured story format if helpful, without requiring one formula or judging the person's character.",
  ],
  "General Commercial Awareness": [
    "Explain the relevant business, legal, or market issue accurately at the level the question requires.",
    "Show the reasoning that links the issue to businesses, clients, or legal work.",
    "Use current evidence for time-sensitive claims and state uncertainty where information is incomplete.",
    "Avoid unsupported predictions or firm-specific claims when the prompt does not provide their basis.",
  ],
  "Scenarios and Ethical Questions": [
    "Identify the central issue, relevant duties, and people affected by the scenario.",
    "Describe practical next steps, including clarification or escalation where appropriate.",
    "Explain the reasoning behind the proposed response and recognise material trade-offs.",
    "Do not reward confident conclusions that depend on facts the prompt does not supply.",
  ],
  "Law Firms as a Business": [
    "Address the business question directly and explain the commercial reasoning.",
    "Connect the analysis to client service, firm operations, or trainee work where relevant.",
    "Support claims with evidence or mark them as assumptions when facts are missing.",
    "Consider reasonable trade-offs instead of presenting speculation as fact.",
  ],
  "Technical Case Studies": [
    "Identify the issues raised by the supplied facts and organise them clearly.",
    "Explain relevant legal or commercial considerations and their potential effect on the client.",
    "State assumptions and identify further information needed before reaching a conclusion.",
    "Do not assess a case-specific conclusion when the case facts, figures, or documents are absent.",
  ],
} as const;

export type RubricCategory = keyof typeof rubrics;
export type RubricCriterion = (typeof rubrics)[RubricCategory][number];
