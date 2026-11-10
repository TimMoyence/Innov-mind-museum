module MusaiumPodPaths
  HERMES_CLI_PATH = 'HERMES_CLI_PATH = $(PODS_ROOT)/hermes-engine/destroot/bin/hermesc'

  def self.relativize(pods_root)
    support = File.join(pods_root, 'Target Support Files', 'Pods-Musaium')
    Dir.glob(File.join(support, 'Pods-Musaium.*.xcconfig')).each do |xcconfig|
      rewrite(xcconfig) { |text| text.gsub(%r{^HERMES_CLI_PATH = /.*hermesc$}, HERMES_CLI_PATH) }
    end
    rewrite(File.join(support, 'expo-configure-project.sh')) do |text|
      text
        .gsub(%r{--target "/[^"]*/Pods/Target Support Files/}, '--target "${PODS_ROOT}/Target Support Files/')
        .gsub(%r{--entitlement "/[^"]*/([^/"]+/[^/"]+\.entitlements)"}, '--entitlement "${PODS_ROOT}/../\1"')
    end
  end

  def self.rewrite(path)
    return unless File.exist?(path)

    text = File.read(path)
    patched = yield(text)
    File.write(path, patched) if patched != text
  end
end

MusaiumPodPaths.relativize(ARGV.fetch(0)) if $PROGRAM_NAME == __FILE__
