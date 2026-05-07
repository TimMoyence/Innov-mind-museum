/**
 * Expo config plugin — bump Gradle daemon JVM heap for D8 dex-merge.
 *
 * `expo prebuild --platform android --clean` regenerates `android/gradle.properties`
 * from the Expo template (default `-Xmx4096m`). On the new architecture
 * (Hermes V1, RN 0.83) D8 spills past 4 GB during `:app:mergeExtDexDebug` and
 * the prebuild fails with `java.lang.OutOfMemoryError: Java heap space`.
 *
 * This plugin runs AFTER prebuild has emitted the template and replaces (or
 * inserts) `org.gradle.jvmargs` with a 6 GB budget. The macOS GitHub runners
 * have 14 GB available, so this leaves headroom for Gradle daemon + Kotlin
 * daemon + Metro concurrently.
 *
 * `-XX:+HeapDumpOnOutOfMemoryError` is harmless on success and produces a
 * `.hprof` next to the failing process if D8 OOMs again — actionable signal
 * for the next investigation, mirrors the rationale of E27's
 * `--stacktrace --info` flags on the gradle invocation.
 */

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
