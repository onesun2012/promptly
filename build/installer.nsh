; Promptly NSIS extras (electron-builder include)
; SPEC: install defaults autostart ON (HKCU Run); uninstall cleans the entry.
; Settings toggle uses Electron setLoginItemSettings (same Run area); keep names in sync.

!macro customInstall
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Promptly" '"$INSTDIR\Promptly.exe"'
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Promptly"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.onesun2012.promptly"
!macroend
