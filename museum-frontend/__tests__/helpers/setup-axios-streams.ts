(globalThis as { fetch?: typeof fetch }).fetch = undefined;

import { faker } from '@faker-js/faker';
faker.seed(42);
