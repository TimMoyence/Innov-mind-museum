import type { KnowledgeBaseService } from '@modules/chat/useCase/knowledge-base.service';
import type { UserMemoryService } from '@modules/chat/useCase/user-memory.service';

type JestMocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? jest.Mock<R, A> : T[K];
};

type MockedKB = Pick<JestMocked<KnowledgeBaseService>, 'lookup' | 'lookupFacts'>;
type MockedMemory = Pick<
  JestMocked<UserMemoryService>,
  | 'getMemoryForPrompt'
  | 'updateAfterSession'
  | 'deleteUserMemory'
  | 'getUserMemory'
  | 'setDisabledByUser'
  | 'isDisabledByUser'
  | 'invalidateCache'
>;

/**
 * Mock {@link KnowledgeBaseService} with jest-spyable methods.
 * Returned type is assignable to `KnowledgeBaseService` via a single localized cast
 * (private constructor fields `provider`/`config` are not exercised in unit tests).
 */
export function makeMockKnowledgeBase(overrides: Partial<MockedKB> = {}): KnowledgeBaseService {
  const mock: MockedKB = {
    lookup: jest.fn().mockResolvedValue(''),
    lookupFacts: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
  return mock as unknown as KnowledgeBaseService;
}

/**
 * Mock {@link UserMemoryService} with jest-spyable methods.
 * Returned type is assignable to `UserMemoryService` via a single localized cast
 * (private `repository` field is not exercised in unit tests).
 */
export function makeMockUserMemory(overrides: Partial<MockedMemory> = {}): UserMemoryService {
  const mock: MockedMemory = {
    getMemoryForPrompt: jest.fn().mockResolvedValue(''),
    updateAfterSession: jest.fn().mockResolvedValue(undefined),
    deleteUserMemory: jest.fn().mockResolvedValue(undefined),
    getUserMemory: jest.fn().mockResolvedValue(null),
    setDisabledByUser: jest.fn().mockResolvedValue(undefined),
    isDisabledByUser: jest.fn().mockResolvedValue(false),
    invalidateCache: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return mock as unknown as UserMemoryService;
}
