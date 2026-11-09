export type ChatPipelinePhase =
  | 'analyzing-image'
  | 'searching-collection'
  | 'composing'
  | 'synthesizing-voice'
  | 'done';

export const PHASE_I18N_KEY = {
  'analyzing-image': 'chat.status.analyzing-image',
  'searching-collection': 'chat.status.searching-collection',
  composing: 'chat.status.composing',
  'synthesizing-voice': 'chat.status.synthesizing-voice',
  done: '',
} as const satisfies Record<ChatPipelinePhase, string>;

export const PHASE_SEQUENCE_TEXT: readonly ChatPipelinePhase[] = [
  'searching-collection',
  'composing',
] as const;

export const PHASE_SEQUENCE_IMAGE: readonly ChatPipelinePhase[] = [
  'analyzing-image',
  'searching-collection',
  'composing',
] as const;
