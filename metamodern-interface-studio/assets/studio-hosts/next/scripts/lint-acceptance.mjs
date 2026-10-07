/** Real ESLint contract for a disposable Next consumer; fixtures are virtual and contain no product code. */
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
const eslint = new ESLint();
const provider = `"use client"
import { createContext, useContext } from "react"
const FixtureContext = createContext("fixture")
export function FixtureProvider({ children }: { children: React.ReactNode }) {
  return <FixtureContext.Provider value="fixture">{children}</FixtureContext.Provider>
}
export function useFixture() { return useContext(FixtureContext) }
export function fixtureHelper() { return "fixture" }
export function FixtureImage() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/fixture.svg" alt="Synthetic fixture" />
}`;
const valid = await eslint.lintText(provider, { filePath: 'src/lint-fixtures/provider.tsx' });
assert.equal(valid[0].errorCount, 0, JSON.stringify(valid[0].messages));
assert.ok(!valid[0].messages.some(m => m.ruleId === 'react-refresh/only-export-components' || /Definition for rule/.test(m.message)));
const invalid = await eslint.lintText('"use client"\nexport default async function FixtureClient() { return <div>Fixture</div> }', { filePath: 'src/lint-fixtures/async-client.tsx' });
assert.ok(invalid[0].messages.some(m => m.ruleId === '@next/next/no-async-client-component'), 'official Next rules remain active');
console.log('Next lint contract passed: mixed provider/hook/helper exports, official inline directive, invalid async client');
