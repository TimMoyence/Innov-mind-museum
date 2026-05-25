import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AiDisclosureFooter } from '@/features/chat/ui/AiDisclosureFooter';

/**
 * I-CMP1 / R1+R2 — the EU AI Act Art. 50 disclosure notice must render at full
 * token contrast. The pre-fix source applies `opacity: 0.7` to the disclosure
 * `<Text>` style which, composited over an already low-contrast secondary text
 * token, drops effective contrast below WCAG 2.1 AA 4.5:1 for normal text.
 *
 * Contrast basis: per design §D2 the fix is the structural removal of the
 * `opacity` reduction (no token change). We deliberately assert the STRUCTURAL
 * fact (no `opacity` key on the resolved style) and do NOT assert a precise
 * composited numeric ratio that was never rendered (UFR-013 honesty —
 * the footer composites over a <LiquidScreen> gradient/blur background whose
 * pixel-exact ratio cannot be computed here).
 */
describe('AiDisclosureFooter (I-CMP1 / R1)', () => {
  it('renders the AI Act Art. 50 disclosure copy from i18n', () => {
    render(<AiDisclosureFooter />);
    expect(screen.getByText('ai_disclosure.chat_footer')).toBeTruthy();
  });

  it('does NOT reduce the disclosure text opacity below full contrast (R1/R2)', () => {
    render(<AiDisclosureFooter />);

    const disclosureText = screen.getByText('ai_disclosure.chat_footer');
    const flattened = StyleSheet.flatten(disclosureText.props.style) as {
      opacity?: number;
    };

    // R1 acceptance: `opacity` absent (or === 1) from the resolved text style.
    // Pre-fix the source sets `opacity: 0.7`, so this assertion fails.
    if (flattened.opacity !== undefined) {
      expect(flattened.opacity).toBe(1);
    } else {
      expect(flattened.opacity).toBeUndefined();
    }
  });
});
