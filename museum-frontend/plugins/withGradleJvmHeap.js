const { withGradleProperties } = require('@expo/config-plugins');

const JVM_ARGS_KEY = 'org.gradle.jvmargs';

function buildJvmArgs({ heap = '6144m', metaspace = '1024m' } = {}) {
  return `-Xmx${heap} -XX:MaxMetaspaceSize=${metaspace} -XX:+HeapDumpOnOutOfMemoryError`;
}

const withGradleJvmHeap = (config, props = {}) =>
  withGradleProperties(config, (c) => {
    const value = buildJvmArgs(props);
    const filtered = c.modResults.filter(
      (item) => !(item.type === 'property' && item.key === JVM_ARGS_KEY),
    );
    filtered.push({ type: 'property', key: JVM_ARGS_KEY, value });
    c.modResults = filtered;
    return c;
  });

module.exports = withGradleJvmHeap;
