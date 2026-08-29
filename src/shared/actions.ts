// Built-in selection actions (SPEC §2C Action system). Custom actions land
// with the prompts table + settings UI; built-ins ship first.

export interface ActionDef {
  id: string
  name: string
  /** {text} is replaced with the selected text. */
  template: string
}

export const BUILTIN_ACTIONS: ActionDef[] = [
  { id: 'ask', name: 'Ask', template: '{text}' },
  {
    id: 'translate',
    name: 'Translate',
    template:
      'Translate the following text into English, preserving formatting and meaning. If it is already in English, translate it into Chinese instead.\n\n{text}'
  },
  {
    id: 'summarize',
    name: 'Summarize',
    template: 'Summarize the following text in 3 concise bullet points:\n\n{text}'
  },
  {
    id: 'explain',
    name: 'Explain',
    template: 'Explain the following text clearly and concisely:\n\n{text}'
  }
]

export function applyTemplate(actionId: string, text: string): string {
  const action = BUILTIN_ACTIONS.find((a) => a.id === actionId)
  if (!action) return text
  return action.template.replace('{text}', text)
}
