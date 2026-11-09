module.exports = {
  isWorklet: () => false,
  createWorklet: (fn) => fn,
  createRunOnJS: (fn) => fn,
  createRunOnUI: (fn) => fn,
  WorkletsModule: {},
};
