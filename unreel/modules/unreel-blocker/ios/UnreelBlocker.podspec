Pod::Spec.new do |s|
  s.name           = 'UnreelBlocker'
  s.version        = '0.1.0'
  s.summary        = 'Screen Time (FamilyControls / ManagedSettings / DeviceActivity) bridge for Unreel'
  s.description    = 'Authorizes Screen Time, presents the app picker, applies shields and schedules DeviceActivity monitoring.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  # Screen Time APIs are iPhone/iPad only; individual (non-parental) authorization needs iOS 16.
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'FamilyControls', 'ManagedSettings', 'DeviceActivity', 'SwiftUI'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
