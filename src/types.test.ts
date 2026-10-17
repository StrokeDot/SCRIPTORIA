import {describe,it,expect} from "vitest";
import {wordCount,estimatedDuration,shortTime} from "./types";
describe("SCRIPTORIA narration tools",()=>{
 it("counts spoken words without blank-space inflation",()=>{
  expect(wordCount("")).toBe(0);
  expect(wordCount("  Why   do we lie? ")).toBe(4);
 });
 it("shows a planning estimate, not a recording time",()=>{
  expect(estimatedDuration("")).toBe(0);
  expect(shortTime(estimatedDuration("one two three"))).toBe("0:01");
  expect(shortTime(122)).toBe("2:02");
 });
});
