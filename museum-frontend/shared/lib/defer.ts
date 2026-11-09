export const defer = (task: () => unknown): void => {
  void Promise.resolve().then(task);
};
