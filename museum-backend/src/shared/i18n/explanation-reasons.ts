/* eslint-disable max-lines, sonarjs/no-duplicate-string -- JUSTIFIED:
   i18n dictionary; 8 locales × 8 keys × short summary + recourse strings inflates
   line count past 400 without offering any split point that doesn't degrade
   readability. The `'self-retry' | 'signal' | 'support'` recourse-type literals
   are inlined in each entry by design — they preserve TypeScript narrowing into
   the `RecourseType` union without a confusing constant indirection that would
   make every entry less readable. Each locale is a self-contained block —
   splitting per-locale would create 7 sibling files that all need to evolve in
   lockstep when a new category is added. Approved-by: tim@2026-05-12 */
import { SUPPORTED_LOCALES, type SupportedLocale } from './locale';

/**
 * GDPR Art 22 + AI Act Art 14 / 50 — i18n explanations + recourse paths for
 * `GET /api/chat/messages/:id/explanation`. Categories mirror
 * `GuardrailBlockReason` (input + output) plus `allowed` and `unknown`.
 * Strings ≤ 200 chars (chat UI). See `docs/GDPR_ART22_SCOPE.md`.
 */

/**
 * Superset of `GuardrailBlockReason` mapped via `mapToExplanationCategory` so
 * external contract decoupled from internal taxonomy.
 */
export type ExplanationCategory =
  | 'off_topic'
  | 'prompt_injection'
  | 'pii'
  | 'service_unavailable'
  | 'unsafe_output';

/** Adds `allowed` + `unknown` to the public categories. */
type ExplanationKey = ExplanationCategory | 'allowed' | 'unknown';

export type RecourseType = 'self-retry' | 'signal' | 'support';

export interface ExplanationStrings {
  summary: string;
  recourse: {
    type: RecourseType;
    description: string;
  };
}

export type ExplanationReasonMap = Record<
  SupportedLocale,
  Record<ExplanationKey, ExplanationStrings>
>;

// FR + EN primary (CLAUDE.md), others mirror same shape (see guardrail-refusals.ts).
export const EXPLANATION_REASONS: ExplanationReasonMap = {
  en: {
    allowed: {
      summary: 'This message was answered normally — no safety rule blocked it.',
      recourse: {
        type: 'signal',
        description: 'If the answer is unsatisfactory, use the Report button to let us know.',
      },
    },
    off_topic: {
      summary:
        "Your message was outside Musaium's scope (art, monuments, museums, architecture, heritage).",
      recourse: {
        type: 'self-retry',
        description: 'Rephrase your question around a cultural topic and try again.',
      },
    },
    prompt_injection: {
      summary:
        "Your message looked like an attempt to override the assistant's instructions, so it was blocked.",
      recourse: {
        type: 'self-retry',
        description: 'Re-ask the question plainly, without instructions aimed at the assistant.',
      },
    },
    pii: {
      summary: 'Your message contained personal data we do not want to forward to the model.',
      recourse: {
        type: 'self-retry',
        description: 'Remove names, emails, phone numbers, addresses and try again.',
      },
    },
    service_unavailable: {
      summary:
        'A safety check could not complete in time — your message was not flagged, the service was temporarily unavailable.',
      recourse: {
        type: 'self-retry',
        description: 'Wait a moment and resend the same message.',
      },
    },
    unsafe_output: {
      summary:
        "The assistant's draft answer was suppressed by an output safety check before reaching you.",
      recourse: {
        type: 'signal',
        description: 'Use the Report button so we can review the case and improve the safeguards.',
      },
    },
    unknown: {
      summary: 'We do not have a recorded category for this decision.',
      recourse: {
        type: 'support',
        description:
          'Contact support if you need a detailed explanation for this specific message.',
      },
    },
  },
  fr: {
    allowed: {
      summary: "Ce message a été traité normalement — aucune règle de sécurité ne l'a bloqué.",
      recourse: {
        type: 'signal',
        description:
          'Si la réponse ne convient pas, utilise le bouton Signaler pour nous prévenir.',
      },
    },
    off_topic: {
      summary:
        'Ton message sortait du périmètre de Musaium (art, monuments, musées, architecture, patrimoine).',
      recourse: {
        type: 'self-retry',
        description: "Reformule ta question autour d'un sujet culturel et réessaie.",
      },
    },
    prompt_injection: {
      summary:
        "Ton message ressemblait à une tentative de contourner les consignes de l'assistant, il a donc été bloqué.",
      recourse: {
        type: 'self-retry',
        description: "Repose ta question simplement, sans instructions destinées à l'assistant.",
      },
    },
    pii: {
      summary:
        'Ton message contenait des données personnelles que nous ne voulons pas transmettre au modèle.',
      recourse: {
        type: 'self-retry',
        description: 'Retire noms, emails, numéros de téléphone, adresses et réessaie.',
      },
    },
    service_unavailable: {
      summary:
        "Une vérification de sécurité n'a pas pu se terminer à temps — ton message n'a pas été signalé, le service était indisponible.",
      recourse: {
        type: 'self-retry',
        description: 'Attends un instant et renvoie le même message.',
      },
    },
    unsafe_output: {
      summary:
        "La réponse brouillon de l'assistant a été supprimée par un contrôle de sécurité avant de t'être livrée.",
      recourse: {
        type: 'signal',
        description:
          "Utilise le bouton Signaler pour qu'on examine le cas et améliore les filtres.",
      },
    },
    unknown: {
      summary: "Nous n'avons pas de catégorie enregistrée pour cette décision.",
      recourse: {
        type: 'support',
        description:
          "Contacte le support si tu as besoin d'une explication détaillée pour ce message.",
      },
    },
  },
  es: {
    allowed: {
      summary: 'Este mensaje se respondió normalmente — ninguna regla de seguridad lo bloqueó.',
      recourse: {
        type: 'signal',
        description: 'Si la respuesta no te satisface, usa el botón Reportar para avisarnos.',
      },
    },
    off_topic: {
      summary:
        'Tu mensaje quedaba fuera del ámbito de Musaium (arte, monumentos, museos, arquitectura, patrimonio).',
      recourse: {
        type: 'self-retry',
        description: 'Reformula tu pregunta sobre un tema cultural y vuelve a intentarlo.',
      },
    },
    prompt_injection: {
      summary:
        'Tu mensaje parecía un intento de eludir las instrucciones del asistente, por eso fue bloqueado.',
      recourse: {
        type: 'self-retry',
        description:
          'Vuelve a plantear la pregunta de forma sencilla, sin instrucciones para el asistente.',
      },
    },
    pii: {
      summary: 'Tu mensaje contenía datos personales que no queremos enviar al modelo.',
      recourse: {
        type: 'self-retry',
        description:
          'Elimina nombres, emails, números de teléfono o direcciones e inténtalo otra vez.',
      },
    },
    service_unavailable: {
      summary:
        'Una comprobación de seguridad no pudo completarse a tiempo — tu mensaje no fue marcado, el servicio estuvo temporalmente no disponible.',
      recourse: {
        type: 'self-retry',
        description: 'Espera un momento y reenvía el mismo mensaje.',
      },
    },
    unsafe_output: {
      summary:
        'El borrador del asistente fue suprimido por un control de seguridad antes de llegarte.',
      recourse: {
        type: 'signal',
        description: 'Usa el botón Reportar para que revisemos el caso y mejoremos los filtros.',
      },
    },
    unknown: {
      summary: 'No tenemos una categoría registrada para esta decisión.',
      recourse: {
        type: 'support',
        description:
          'Contacta con soporte si necesitas una explicación detallada para este mensaje.',
      },
    },
  },
  de: {
    allowed: {
      summary:
        'Diese Nachricht wurde normal beantwortet — keine Sicherheitsregel hat sie blockiert.',
      recourse: {
        type: 'signal',
        description:
          'Wenn die Antwort nicht passt, nutze die Melden-Schaltfläche, um uns zu informieren.',
      },
    },
    off_topic: {
      summary:
        'Deine Nachricht lag außerhalb des Themenrahmens von Musaium (Kunst, Denkmäler, Museen, Architektur, Kulturerbe).',
      recourse: {
        type: 'self-retry',
        description: 'Formuliere deine Frage zu einem kulturellen Thema um und versuche es erneut.',
      },
    },
    prompt_injection: {
      summary:
        'Deine Nachricht sah aus wie ein Versuch, die Anweisungen des Assistenten zu umgehen, deshalb wurde sie blockiert.',
      recourse: {
        type: 'self-retry',
        description: 'Stelle die Frage einfach neu, ohne Anweisungen an den Assistenten.',
      },
    },
    pii: {
      summary:
        'Deine Nachricht enthielt personenbezogene Daten, die wir nicht an das Modell weitergeben wollen.',
      recourse: {
        type: 'self-retry',
        description: 'Entferne Namen, E-Mails, Telefonnummern, Adressen und versuche es erneut.',
      },
    },
    service_unavailable: {
      summary:
        'Eine Sicherheitsprüfung konnte nicht rechtzeitig abgeschlossen werden — deine Nachricht wurde nicht markiert, der Dienst war vorübergehend nicht verfügbar.',
      recourse: {
        type: 'self-retry',
        description: 'Warte einen Moment und sende dieselbe Nachricht erneut.',
      },
    },
    unsafe_output: {
      summary:
        'Der Entwurf des Assistenten wurde durch eine Ausgabe-Sicherheitsprüfung gestoppt, bevor er dich erreichen konnte.',
      recourse: {
        type: 'signal',
        description:
          'Nutze die Melden-Schaltfläche, damit wir den Fall prüfen und die Filter verbessern.',
      },
    },
    unknown: {
      summary: 'Für diese Entscheidung liegt uns keine erfasste Kategorie vor.',
      recourse: {
        type: 'support',
        description:
          'Wende dich an den Support, wenn du eine ausführliche Erklärung zu dieser Nachricht brauchst.',
      },
    },
  },
  it: {
    allowed: {
      summary:
        'Questo messaggio è stato gestito normalmente — nessuna regola di sicurezza lo ha bloccato.',
      recourse: {
        type: 'signal',
        description: 'Se la risposta non ti soddisfa, usa il pulsante Segnala per avvisarci.',
      },
    },
    off_topic: {
      summary:
        'Il tuo messaggio era fuori dal perimetro di Musaium (arte, monumenti, musei, architettura, patrimonio).',
      recourse: {
        type: 'self-retry',
        description: 'Riformula la domanda su un tema culturale e riprova.',
      },
    },
    prompt_injection: {
      summary:
        "Il tuo messaggio sembrava un tentativo di aggirare le istruzioni dell'assistente, perciò è stato bloccato.",
      recourse: {
        type: 'self-retry',
        description: "Riponi la domanda in modo semplice, senza istruzioni rivolte all'assistente.",
      },
    },
    pii: {
      summary: 'Il tuo messaggio conteneva dati personali che non vogliamo inoltrare al modello.',
      recourse: {
        type: 'self-retry',
        description: 'Rimuovi nomi, email, numeri di telefono, indirizzi e riprova.',
      },
    },
    service_unavailable: {
      summary:
        'Un controllo di sicurezza non si è completato in tempo — il messaggio non è stato segnalato, il servizio era temporaneamente non disponibile.',
      recourse: {
        type: 'self-retry',
        description: 'Aspetta un istante e rinvia lo stesso messaggio.',
      },
    },
    unsafe_output: {
      summary:
        "La bozza di risposta dell'assistente è stata bloccata da un controllo di sicurezza prima di raggiungerti.",
      recourse: {
        type: 'signal',
        description: 'Usa il pulsante Segnala per farci esaminare il caso e migliorare i filtri.',
      },
    },
    unknown: {
      summary: 'Non abbiamo una categoria registrata per questa decisione.',
      recourse: {
        type: 'support',
        description:
          'Contatta il supporto se ti serve una spiegazione dettagliata per questo messaggio.',
      },
    },
  },
  ja: {
    allowed: {
      summary: 'このメッセージは通常通り処理されました。安全ルールによるブロックはありません。',
      recourse: {
        type: 'signal',
        description: '回答にご不満があれば、「報告」ボタンでお知らせください。',
      },
    },
    off_topic: {
      summary:
        'メッセージが Musaium の対象範囲（美術・記念碑・博物館・建築・文化遺産）から外れていました。',
      recourse: {
        type: 'self-retry',
        description: '文化的なテーマに沿って質問を言い換えて、もう一度お試しください。',
      },
    },
    prompt_injection: {
      summary:
        'アシスタントの指示を上書きしようとする内容と判定されたため、メッセージはブロックされました。',
      recourse: {
        type: 'self-retry',
        description: 'アシスタント宛ての指示を含めず、シンプルに質問し直してください。',
      },
    },
    pii: {
      summary: 'メッセージにモデルへ送りたくない個人情報が含まれていました。',
      recourse: {
        type: 'self-retry',
        description: '氏名・メール・電話番号・住所などを除いて、もう一度お試しください。',
      },
    },
    service_unavailable: {
      summary:
        '安全チェックが時間内に完了できませんでした。メッセージが不適切と判定されたわけではなく、一時的にサービスが利用できなかったためです。',
      recourse: {
        type: 'self-retry',
        description: '少しお待ちいただき、同じメッセージを再送してください。',
      },
    },
    unsafe_output: {
      summary: 'アシスタントの下書き応答は、お届けする前に出力側の安全チェックで抑止されました。',
      recourse: {
        type: 'signal',
        description: '「報告」ボタンからお知らせください。事例を確認しフィルターを改善します。',
      },
    },
    unknown: {
      summary: 'この判定について記録されたカテゴリーがありません。',
      recourse: {
        type: 'support',
        description:
          'このメッセージに関する詳しい説明が必要な場合はサポートにお問い合わせください。',
      },
    },
  },
  zh: {
    allowed: {
      summary: '此消息已正常处理 — 没有安全规则将其拦截。',
      recourse: {
        type: 'signal',
        description: '若回答不令您满意，请使用「举报」按钮告知我们。',
      },
    },
    off_topic: {
      summary: '您的消息超出了 Musaium 的范围（艺术、纪念碑、博物馆、建筑、文化遗产）。',
      recourse: {
        type: 'self-retry',
        description: '请围绕文化主题重新组织问题后再试。',
      },
    },
    prompt_injection: {
      summary: '您的消息看起来像是在试图覆盖助手的指令，因此被拦截。',
      recourse: {
        type: 'self-retry',
        description: '请直接重新提问，不要附带针对助手的指令。',
      },
    },
    pii: {
      summary: '您的消息包含我们不希望转发给模型的个人数据。',
      recourse: {
        type: 'self-retry',
        description: '请去除姓名、邮箱、电话、地址等信息后再试。',
      },
    },
    service_unavailable: {
      summary: '安全检查未能在限定时间内完成 — 您的消息并未被标记，服务暂时不可用。',
      recourse: {
        type: 'self-retry',
        description: '请稍候片刻，再次发送同一条消息。',
      },
    },
    unsafe_output: {
      summary: '助手的草稿回复在送达您之前被输出端的安全检查拦截。',
      recourse: {
        type: 'signal',
        description: '请使用「举报」按钮告知我们，我们将复核并改进过滤。',
      },
    },
    unknown: {
      summary: '我们没有为该决定记录的类别。',
      recourse: {
        type: 'support',
        description: '若您需要针对此条消息的详细解释，请联系客服。',
      },
    },
  },
  ar: {
    allowed: {
      summary: 'تمت معالجة هذه الرسالة بشكل طبيعي — لم تُحظر بأي قاعدة أمان.',
      recourse: {
        type: 'signal',
        description: 'إذا كانت الإجابة غير مُرضية، فاستخدم زر «الإبلاغ» لإخبارنا.',
      },
    },
    off_topic: {
      summary: 'رسالتك خارج نطاق Musaium (الفن، المعالم، المتاحف، العمارة، التراث الثقافي).',
      recourse: {
        type: 'self-retry',
        description: 'يرجى إعادة صياغة سؤالك حول موضوع ثقافي والمحاولة من جديد.',
      },
    },
    prompt_injection: {
      summary: 'بدت رسالتك وكأنها تحاول تجاوز تعليمات المساعد، فتم حظرها.',
      recourse: {
        type: 'self-retry',
        description: 'يرجى إعادة طرح سؤالك مباشرةً، دون تضمين تعليمات موجَّهة للمساعد.',
      },
    },
    pii: {
      summary: 'احتوت رسالتك على بيانات شخصية لا نرغب في إرسالها إلى النموذج.',
      recourse: {
        type: 'self-retry',
        description: 'يرجى إزالة الأسماء وعناوين البريد والأرقام والعناوين قبل المحاولة من جديد.',
      },
    },
    service_unavailable: {
      summary: 'لم يكتمل فحص الأمان في الوقت المتاح — رسالتك لم تُوسم، الخدمة غير متاحة مؤقتًا.',
      recourse: {
        type: 'self-retry',
        description: 'يرجى الانتظار لحظات ثم إعادة إرسال الرسالة نفسها.',
      },
    },
    unsafe_output: {
      summary: 'تم حظر مسودة رد المساعد عند مرحلة فحص المخرجات قبل وصولها إليك.',
      recourse: {
        type: 'signal',
        description: 'يرجى استخدام زر «الإبلاغ» لإعلامنا — سنُراجع الحالة ونُحسِّن المُرشِّحات.',
      },
    },
    unknown: {
      summary: 'لا تتوفر لدينا فئة مسجَّلة لهذا القرار.',
      recourse: {
        type: 'support',
        description: 'إن احتجت إلى شرح مفصَّل لهذه الرسالة بالذات، فيرجى التواصل مع الدعم.',
      },
    },
  },
};

/** Compile-time guarantee every locale has an entry. */
export type ExplanationReasonsType = {
  [K in SupportedLocale]: (typeof EXPLANATION_REASONS)[K];
};

/** Raw `GuardrailBlockReason` + historic synonyms → public category. */
const CATEGORY_MAPPING: Readonly<Record<string, ExplanationCategory>> = {
  off_topic: 'off_topic',
  prompt_injection: 'prompt_injection',
  jailbreak: 'prompt_injection',
  pii: 'pii',
  data_exfiltration: 'pii',
  service_unavailable: 'service_unavailable',
  toxicity: 'unsafe_output',
  bias: 'unsafe_output',
  schema_violation: 'unsafe_output',
  error: 'unsafe_output',
  unsafe_output: 'unsafe_output',
};

/** null when reason has no user-facing category. */
export function mapToExplanationCategory(
  reason: string | null | undefined,
): ExplanationCategory | null {
  if (!reason) return null;
  return CATEGORY_MAPPING[reason] ?? null;
}

export function getExplanationStrings(
  locale: SupportedLocale,
  key: ExplanationKey,
): ExplanationStrings {
  return EXPLANATION_REASONS[locale][key];
}

export { SUPPORTED_LOCALES };
