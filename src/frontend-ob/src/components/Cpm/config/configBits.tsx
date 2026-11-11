/**
 * CHG-169 (owner review): the small pieces every Gate Configuration view draws the same way - a state as tone + glyph + word,
 * a change class in words, a long property name that wraps between its words.
 */
import React from 'react';
import { TonePill } from '../shared';
import { breakableParts, bundleStateWord, classWord, type StateWord } from './configWords';

export const WordPill: React.FC<{ word: StateWord }> = ({ word }) => <TonePill tone={word.tone} glyph={word.glyph}>{word.label}</TonePill>;

export const BundleStatePill: React.FC<{ state: string | null | undefined }> = ({ state }) => <WordPill word={bundleStateWord(state)} />;

export const ClassWord: React.FC<{ changeClass: string | null | undefined }> = ({ changeClass }) => {
  const w = classWord(changeClass);
  return <span className={`cpm-config-class cpm-config-class--${w.tone}`}>{w.glyph ? `${w.glyph} ` : ''}{w.label}</span>;
};

/** A property name that may break after "_" and ".", never inside a word. */
export const Breakable: React.FC<{ name: string }> = ({ name }) => (
  <>{breakableParts(name).map((part, i) => <React.Fragment key={i}>{i > 0 && <wbr />}{part}</React.Fragment>)}</>
);
