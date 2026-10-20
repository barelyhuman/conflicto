import { describe, expect, it } from 'vitest';
import { classifyMatches, looksLikeDefinition } from './definitionHeuristic.js';

describe('looksLikeDefinition', () => {
  const cases = [
    ['go', 'Foo', 'func Foo(a int) error {', true],
    ['go', 'Foo', 'func (s *Server) Foo() {', true],
    ['go', 'Foo', 'type Foo struct {', true],
    ['go', 'Foo', 'const Foo = 1', true],
    ['go', 'x', '\tx := 3', true],
    ['go', 'a', '\ta, b := f()', true],
    ['go', 'Foo', '\treturn Foo(1)', false],
    ['go', 'Foo', '// Foo does things', false],
    ['typescript', 'Foo', 'export function Foo() {}', true],
    ['typescript', 'Foo', 'export default class Foo extends Bar {', true],
    ['typescript', 'foo', 'const foo = () => 1', true],
    ['typescript', 'Foo', 'export type Foo = string', true],
    ['typescript', 'Foo', 'export { Foo } from "./x"', true],
    ['typescript', 'foo', 'foo(1)', false],
    ['python', 'foo', 'def foo(x):', true],
    ['python', 'foo', '    async def foo(self):', true],
    ['python', 'Foo', 'class Foo(Base):', true],
    ['python', 'foo', 'x = foo(1)', false],
    ['rust', 'foo', 'pub fn foo() {}', true],
    ['rust', 'Foo', 'pub(crate) struct Foo;', true],
    ['rust', 'foo', 'let foo = 1;', true],
    ['rust', 'foo', 'foo();', false],
    ['markdown', 'foo', 'func foo', false],
  ];

  for (const [lang, word, line, expected] of cases) {
    it(`${lang}: ${JSON.stringify(line)} -> ${expected}`, () => {
      expect(looksLikeDefinition(line, word, lang)).toBe(expected);
    });
  }

  it('escapes regex metacharacters in the word', () => {
    expect(looksLikeDefinition('const $a = 1', '$a', 'typescript')).toBe(true);
  });
});

describe('classifyMatches', () => {
  it('splits strong from weak preserving order', () => {
    const ms = [
      { text: 'return Foo()' },
      { text: 'func Foo() {' },
      { text: '// Foo' },
    ];
    const { strong, weak } = classifyMatches(ms, 'Foo', 'go');
    expect(strong).toEqual([ms[1]]);
    expect(weak).toEqual([ms[0], ms[2]]);
  });
});
