import { app } from 'electron'
import { join } from 'node:path'

/** Brand icon for window titlebars/taskbar: the simplified variant stays
 * legible at 16px (full-detail icon.png is for exe/installer via
 * electron-builder). */
export function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon-small.png')
    : join(app.getAppPath(), 'build', 'icon-small.png')
}
