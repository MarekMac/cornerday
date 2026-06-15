interface ChecklistItem {
  id: string;
  title: string;
  desc: string;
}

export interface ChecklistSection {
  title: string;
  emoji: string;
  items: ChecklistItem[];
}

export const SECTIONS: ChecklistSection[] = [
  {
    title: 'Remove access',
    emoji: '🗑️',
    items: [
      { id: 'delete_apps', title: 'Delete gambling & betting apps', desc: 'Remove all gambling apps from your phone and tablet.' },
      { id: 'remove_cards', title: 'Remove saved payment details', desc: 'Delete stored card info from gambling websites and accounts.' },
      { id: 'delete_accounts', title: 'Close gambling accounts', desc: 'Request account closure from operators where possible.' },
    ],
  },
  {
    title: 'Block access',
    emoji: '🔒',
    items: [
      { id: 'website_blocker', title: 'Install a website blocker', desc: "Use Gamban, Betfilter, or your browser's parental controls to block gambling sites." },
      { id: 'bank_block', title: 'Block gambling transactions at your bank', desc: 'Call or message your bank to block payments to gambling merchants.' },
      { id: 'spending_limit', title: 'Set a daily spending limit', desc: 'Use your bank app to set a daily card spending cap.' },
    ],
  },
  {
    title: 'Self-exclusion',
    emoji: '🚫',
    items: [
      { id: 'self_exclude_operators', title: "Self-exclude from operators you've used", desc: 'Log in and request self-exclusion from each gambling site or app.' },
      { id: 'national_exclusion', title: 'Join a national self-exclusion scheme', desc: 'GamStop (UK), SENSE (Australia), GameSense (Canada), or your country\'s equivalent.' },
    ],
  },
  {
    title: 'Support network',
    emoji: '🤝',
    items: [
      { id: 'tell_someone', title: 'Tell one trusted person', desc: 'Share your decision to stop with a partner, family member, or friend.' },
      { id: 'save_helpline', title: 'Save the helpline number', desc: 'Add 1-800-522-4700 (US) or your local helpline to your contacts.' },
    ],
  },
  {
    title: 'Clean your environment',
    emoji: '🧹',
    items: [
      { id: 'unsubscribe_emails', title: 'Unsubscribe from promo emails & texts', desc: 'Opt out of all gambling marketing communications.' },
      { id: 'unfollow_social', title: 'Unfollow gambling accounts', desc: 'Mute or unfollow gambling-related accounts on social media.' },
      { id: 'clear_bookmarks', title: 'Clear gambling bookmarks & history', desc: 'Delete saved gambling sites from your browser.' },
    ],
  },
];

export const CHECKLIST_TOTAL = SECTIONS.reduce((acc, s) => acc + s.items.length, 0);
