import {
  cleanText,
  MAX_TEXT_LENGTH,
  RANGES,
  type ChoiceKey,
  type ColorKey,
  type RangeKey,
  type Settings,
  type ToggleKey,
} from './settings';

type Control =
  | { type: 'text'; key: 'text'; label: string }
  | { type: 'color'; key: ColorKey; label: string; swatches: string[] }
  | { type: 'range'; key: RangeKey; label: string; format: (value: number) => string }
  | { type: 'choice'; key: ChoiceKey; label: string; options: [value: string, label: string][] }
  | { type: 'toggle'; key: ToggleKey; label: string };

const percent = (value: number) => `${value}%`;

const SECTIONS: { title: string; controls: Control[] }[] = [
  {
    title: 'Mensagem',
    controls: [
      { type: 'text', key: 'text', label: 'Texto' },
      { type: 'choice', key: 'font', label: 'Fonte', options: [['mono', 'Mono'], ['sans', 'Sans'], ['serif', 'Serif']] },
      { type: 'toggle', key: 'bold', label: 'Negrito' },
      { type: 'range', key: 'textSize', label: 'Tamanho do texto', format: percent },
    ],
  },
  {
    title: 'Cores',
    controls: [
      { type: 'color', key: 'led', label: 'LED', swatches: ['#00ff00', '#ff2020', '#ffb000', '#00b4ff', '#ff3cf0', '#ffffff'] },
      { type: 'color', key: 'background', label: 'Fundo', swatches: ['#000000', '#191919', '#0b1026', '#200808'] },
    ],
  },
  {
    title: 'Movimento',
    controls: [
      { type: 'range', key: 'speed', label: 'Velocidade', format: (value) => (value === 0 ? 'Parado' : `${value} LEDs/s`) },
      { type: 'choice', key: 'direction', label: 'Direção', options: [['left', '← Esquerda'], ['right', 'Direita →']] },
      { type: 'toggle', key: 'smooth', label: 'Rolagem suave' },
      { type: 'toggle', key: 'mirror', label: 'Espelhar' },
    ],
  },
  {
    title: 'Painel',
    controls: [
      { type: 'range', key: 'rows', label: 'Linhas de LED', format: String },
      { type: 'range', key: 'dotSize', label: 'Tamanho do LED', format: percent },
      { type: 'range', key: 'glow', label: 'Brilho', format: percent },
      { type: 'range', key: 'dim', label: 'LEDs apagados', format: percent },
    ],
  },
  {
    title: 'Tela',
    controls: [
      {
        type: 'choice',
        key: 'rotation',
        label: 'Rotação',
        options: [['auto', 'Auto'], ['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']],
      },
      { type: 'toggle', key: 'keepAwake', label: 'Manter tela ligada' },
    ],
  },
];

export type Change = <K extends keyof Settings>(key: K, value: Settings[K]) => void;
type Sync = (settings: Settings) => void;

export interface Panel {
  /** Puts the current values back into the inputs (after a reset, for instance). */
  sync(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Builds the settings form into `container`. `settings` is the live object: every input calls `onChange`
 * and then re-syncs the form from it, so swatches, outputs and radios always show the applied value.
 */
export function buildPanel(
  container: HTMLElement,
  settings: Settings,
  onChange: Change,
  available: { glow: boolean; wakeLock: boolean },
): Panel {
  const syncs: Sync[] = [];
  const sync = () => syncs.forEach((update) => update(settings));
  const emit: Change = (key, value) => {
    onChange(key, value);
    sync();
  };

  for (const section of SECTIONS) {
    const controls = section.controls.filter(
      (control) => (control.key !== 'glow' || available.glow) && (control.key !== 'keepAwake' || available.wakeLock),
    );
    if (!controls.length) continue;
    container.append(element('h2', 'section-title', section.title));
    for (const control of controls) {
      const [node, update] = field(control, emit);
      container.append(node);
      syncs.push(update);
    }
  }
  sync();
  return { sync };
}

function field(control: Control, emit: Change): [HTMLElement, Sync] {
  switch (control.type) {
    case 'text': {
      const wrapper = element('label', 'field');
      const input = element('textarea');
      input.rows = 2;
      input.maxLength = MAX_TEXT_LENGTH;
      input.spellcheck = false;
      input.enterKeyHint = 'done';
      input.placeholder = 'Digite a mensagem';
      input.addEventListener('input', () => emit('text', cleanText(input.value)));
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        input.blur();
      });
      wrapper.append(element('span', 'field-head', control.label), input);
      // Never rewrite the box while typing: the caret would jump to the end.
      return [wrapper, (s) => document.activeElement !== input && input.value !== s.text && (input.value = s.text)];
    }

    case 'range': {
      const { key, format } = control;
      const wrapper = element('label', 'field');
      const head = element('span', 'field-head');
      const output = element('output');
      head.append(element('span', undefined, control.label), output);
      const input = element('input');
      input.type = 'range';
      input.min = String(RANGES[key].min);
      input.max = String(RANGES[key].max);
      input.step = String(RANGES[key].step);
      input.addEventListener('input', () => emit(key, Number(input.value)));
      wrapper.append(head, input);
      return [
        wrapper,
        (s) => {
          input.value = String(s[key]);
          output.textContent = format(s[key]);
        },
      ];
    }

    case 'color': {
      const { key, swatches } = control;
      const wrapper = element('div', 'field');
      const row = element('div', 'swatches');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', control.label);
      const buttons = swatches.map((color) => {
        const button = element('button', 'swatch');
        button.type = 'button';
        button.style.setProperty('--swatch', color);
        button.setAttribute('aria-label', color);
        button.addEventListener('click', () => emit(key, color));
        return button;
      });
      const custom = element('label', 'swatch swatch-custom');
      custom.title = 'Outra cor';
      const picker = element('input');
      picker.type = 'color';
      picker.setAttribute('aria-label', `${control.label}: outra cor`);
      picker.addEventListener('input', () => emit(key, picker.value));
      custom.append(picker);
      row.append(...buttons, custom);
      wrapper.append(element('span', 'field-head', control.label), row);
      return [
        wrapper,
        (s) => {
          const value = s[key];
          picker.value = value;
          buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(swatches[i] === value)));
          custom.classList.toggle('selected', !swatches.includes(value));
        },
      ];
    }

    case 'choice': {
      const { key } = control;
      const wrapper = element('div', 'field');
      const group = element('div', 'segmented');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', control.label);
      const inputs = control.options.map(([value, label]) => {
        const option = element('label');
        const input = element('input');
        input.type = 'radio';
        input.name = key;
        input.value = value;
        input.addEventListener('change', () => input.checked && emit(key, value as Settings[typeof key]));
        option.append(input, element('span', undefined, label));
        group.append(option);
        return input;
      });
      wrapper.append(element('span', 'field-head', control.label), group);
      return [wrapper, (s) => inputs.forEach((input) => (input.checked = input.value === s[key]))];
    }

    case 'toggle': {
      const { key } = control;
      const row = element('label', 'toggle');
      const input = element('input');
      input.type = 'checkbox';
      input.role = 'switch';
      input.addEventListener('change', () => emit(key, input.checked));
      row.append(element('span', undefined, control.label), input);
      return [row, (s) => (input.checked = s[key])];
    }
  }
}
