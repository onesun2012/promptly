; Promptly NSIS extras (electron-builder include)
; SPEC success criteria: uninstall cleans up the autostart Run entry.

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Promptly"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.onesun2012.promptly"
!macroend
