import React from 'react';
import { render } from '@testing-library/react-native';

import '../helpers/test-utils';
import { makeComposerProps } from '../helpers/factories/composer.factories';
import { Composer } from '@/features/chat/ui/Composer';

type ReactTestInstance = ReturnType<ReturnType<typeof render>['getByTestId']>;

interface NodeProps {
  testID?: string;
  style?: unknown;
  children?: unknown;
}

interface MinimalNode {
  type?: string;
  props?: NodeProps;
  parent?: MinimalNode | null;
}

const flattenStyle = (style: unknown): Record<string, unknown> => {
  if (style == null) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  if (typeof style === 'object') return style as Record<string, unknown>;
  return {};
};

const findAncestor = (
  start: ReactTestInstance,
  match: (node: MinimalNode) => boolean,
): MinimalNode | null => {
  let node: MinimalNode | null = start as unknown as MinimalNode;
  while (node) {
    if (match(node)) return node;
    node = node.parent ?? null;
  }
  return null;
};

const collectTestIDsInOrder = (root: ReactTestInstance, testIDs: readonly string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  const set = new Set(testIDs);
  const visit = (node: MinimalNode | null | undefined): void => {
    if (!node || typeof node !== 'object') return;
    const tid = node.props?.testID;
    if (typeof tid === 'string' && set.has(tid) && !seen.has(tid)) {
      result.push(tid);
      seen.add(tid);
    }
    const kids = (node as unknown as { children?: unknown[] }).children;
    if (Array.isArray(kids)) {
      for (const child of kids) visit(child as MinimalNode);
    }
  };
  visit(root as unknown as MinimalNode);
  return result;
};

describe('Composer — leading-column layout (R1, R3, R4)', () => {
  it('R1 — mic + attach share a leading column with flexDirection=column, mic before attach', () => {
    const view = render(<Composer {...makeComposerProps()} />);
    const mic = view.getByTestId('composer-mic-button');
    const attach = view.getByTestId('composer-attach-button');

    const micAncestors = new Set<MinimalNode>();
    let m: MinimalNode | null = mic as unknown as MinimalNode;
    while (m) {
      micAncestors.add(m);
      m = m.parent ?? null;
    }
    let lca: MinimalNode | null = null;
    let a: MinimalNode | null = attach as unknown as MinimalNode;
    while (a) {
      if (micAncestors.has(a)) {
        lca = a;
        break;
      }
      a = a.parent ?? null;
    }
    expect(lca).not.toBeNull();
    const columnAncestor = findAncestor(lca as unknown as ReactTestInstance, (n) => {
      const s = flattenStyle(n.props?.style);
      return s.flexDirection === 'column';
    });
    expect(columnAncestor).not.toBeNull();

    const rowAncestor = findAncestor(columnAncestor as unknown as ReactTestInstance, (n) => {
      const s = flattenStyle(n.props?.style);
      return s.flexDirection === 'row';
    });
    expect(rowAncestor).not.toBeNull();

    const order = collectTestIDsInOrder(
      lca as unknown as ReactTestInstance,
      ['composer-mic-button', 'composer-attach-button'] as const,
    );
    expect(order).toEqual(['composer-mic-button', 'composer-attach-button']);
  });

  it('R3 / D2 — audio-pill rendered OUTSIDE the leading column when recordedAudioUri is set', () => {
    const view = render(
      <Composer {...makeComposerProps({ recordedAudioUri: 'file:///tmp/audio.m4a' })} />,
    );
    const mic = view.getByTestId('composer-mic-button');
    const pill = view.getByTestId('composer-audio-pill');

    const attach = view.getByTestId('composer-attach-button');
    const micAncestors = new Set<MinimalNode>();
    let m: MinimalNode | null = mic as unknown as MinimalNode;
    while (m) {
      micAncestors.add(m);
      m = m.parent ?? null;
    }
    let leadingColumn: MinimalNode | null = null;
    let a: MinimalNode | null = attach as unknown as MinimalNode;
    while (a) {
      if (micAncestors.has(a)) {
        leadingColumn = a;
        break;
      }
      a = a.parent ?? null;
    }
    expect(leadingColumn).not.toBeNull();

    let p: MinimalNode | null = pill as unknown as MinimalNode;
    let pillInsideColumn = false;
    while (p) {
      if (p === leadingColumn) {
        pillInsideColumn = true;
        break;
      }
      p = p.parent ?? null;
    }
    expect(pillInsideColumn).toBe(false);
  });

  it('R4 — DOM order is mic → attach → chat-input → send-button', () => {
    const view = render(<Composer {...makeComposerProps()} />);
    const mic = view.getByTestId('composer-mic-button');
    const rowAncestor = findAncestor(mic, (node) => {
      const s = flattenStyle(node.props?.style);
      return s.flexDirection === 'row';
    });
    expect(rowAncestor).not.toBeNull();

    const order = collectTestIDsInOrder(
      rowAncestor as unknown as ReactTestInstance,
      ['composer-mic-button', 'composer-attach-button', 'chat-input', 'send-button'] as const,
    );
    expect(order.indexOf('composer-mic-button')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('composer-attach-button')).toBeGreaterThan(
      order.indexOf('composer-mic-button'),
    );
    expect(order.indexOf('chat-input')).toBeGreaterThan(order.indexOf('composer-attach-button'));
    expect(order.indexOf('send-button')).toBeGreaterThan(order.indexOf('chat-input'));
  });
});
