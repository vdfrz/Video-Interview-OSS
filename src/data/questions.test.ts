import { describe, expect, it } from "vitest";
import { questions, selectSessionQuestions } from "./questions";

const categoryForSession = [
  "Motivation for Commercial Law",
  "Competency Interview Questions",
  "Character and Personality",
];
const defaultMotivationIds = new Set(["1", "2", "6", "7", "9", "10"]);
const excludedPersonalContextIds = new Set([
  "29", "36", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52",
]);

describe("question bank", () => {
  it("retains all 201 source entries, source IDs, categories, and page mapping", () => {
    expect(questions).toHaveLength(201);
    expect(questions.map(({ id }) => id)).toEqual([
      ...Array.from({ length: 17 }, (_, i) => String(i + 1)),
      "17a",
      ...Array.from({ length: 183 }, (_, i) => String(i + 18)),
    ]);

    const pageRanges: Array<[number, number, number]> = [
      [1, 18, 1],
      [19, 42, 2],
      [43, 61, 3],
      [62, 82, 4],
      [83, 106, 5],
      [107, 125, 6],
      [126, 146, 7],
      [147, 163, 8],
      [164, 178, 9],
      [179, 200, 10],
    ];
    for (const [first, last, page] of pageRanges) {
      for (let id = first; id <= last; id += 1) {
        expect(questions.find((question) => question.id === String(id))?.sourcePage).toBe(page);
      }
    }
    expect(questions.find((question) => question.id === "17a")?.sourcePage).toBe(1);
  });

  it("draws one eligible question from each of the three session categories", () => {
    for (let draw = 0; draw < 100; draw += 1) {
      const session = selectSessionQuestions();
      expect(session).toHaveLength(3);
      expect(new Set(session.map(({ id }) => id)).size).toBe(3);
      expect(session.map(({ category }) => category)).toEqual(categoryForSession);
      expect(session.every(({ defaultEligible }) => defaultEligible)).toBe(true);
      expect(defaultMotivationIds.has(session[0].id)).toBe(true);
      expect(excludedPersonalContextIds.has(session[2].id)).toBe(false);
    }
  });
});
