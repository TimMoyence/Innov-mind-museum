// Mock for react-native-worklets — native module unavailable in Jest
module.exports = {
  isWorklet: () => false,
  createWorklet: (fn) => fn,
  createRunOnJS: (fn) => fn,
  createRunOnUI: (fn) => fn,
  WorkletsModule: {},
};
