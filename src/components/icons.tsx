import { Skull, Bug, Radio, Crosshair, Newspaper, Fingerprint } from 'lucide-react';
import type { EType } from '../lib/types';
export const TYPE_META: Record<EType, { label: string; Icon: any; color: string }> = {
  ransomware: { label: 'Ransomware', Icon: Skull, color: '#ff7a1a' },
  vuln: { label: 'Vulnerability', Icon: Bug, color: '#ffc21a' },
  c2: { label: 'Botnet C2', Icon: Radio, color: '#ff2d55' },
  attack: { label: 'Attack source', Icon: Crosshair, color: '#3aa0ff' },
  news: { label: 'News / advisory', Icon: Newspaper, color: '#a78bfa' },
  ioc: { label: 'IOC', Icon: Fingerprint, color: '#22e3ff' },
};
