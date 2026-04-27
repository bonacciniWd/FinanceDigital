/**
 * @module Calculadora
 * @description Tela de fachada do app — uma calculadora funcional. Trigger secreto
 * para acessar o app real: digitar `777 / 3` e pressionar `=` duas vezes.
 *
 * Fonte: portado do CodePen (Open Sans + layout estilo Calculadora do Windows),
 * reescrito como componente React/TS sem dependências externas e isolado em CSS embutido.
 *
 * Comportamento esperado:
 *  - Usuário "casual" usa como calculadora normal
 *  - Sequência mágica: dígitos `7 7 7`, sinal `÷`, dígito `3`, `=` → mostra `259`,
 *    pressionar `=` de novo (segundo `=`) → redireciona para `/login` (ou `/dashboard`
 *    se já houver sessão Supabase persistida).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';

const SECRET_FIRST = '259'; // resultado de 777 / 3

export default function Calculadora() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [main, setMain] = useState('0');
  const [history, setHistory] = useState('');

  // Display sync ref (React state é assíncrono — ref garante leitura imediata
  // dentro do mesmo handler, essencial pro detector do trigger funcionar).
  const displayRef = useRef('0');
  const writeMain = (v: string) => {
    displayRef.current = v;
    setMain(v);
  };

  // Estado interno (refs para evitar fechamentos no handler)
  const stateRef = useRef({
    result: null as number | null,
    currNum: '0' as string,
    prevResult: null as number | null,
    prevBtn: null as string | null,
    mathOp: null as null | ((v: number) => void),
    prevMathOp: null as null | ((v: number) => void),
    mathOpCount: 0,
    mathOpPress: false,
    isInit: true,
    triggerArmed: false, // ficou true quando `=` foi pressionado e o display mostrou 259
  });

  function setResult(n: number | null) {
    stateRef.current.result = n;
  }
  function getResult() {
    return stateRef.current.result;
  }

  function addition(v: number) {
    setResult((getResult() ?? 0) + v);
  }
  function subtraction(v: number) {
    setResult((getResult() ?? 0) - v);
  }
  function multiplication(v: number) {
    setResult((getResult() ?? 0) * v);
  }
  function division(v: number) {
    if (v === 0) {
      setResult(NaN);
      return;
    }
    setResult((getResult() ?? 0) / v);
  }

  function init() {
    const s = stateRef.current;
    s.result = null;
    s.currNum = '0';
    s.prevResult = null;
    s.prevBtn = null;
    s.mathOp = null;
    s.prevMathOp = null;
    s.mathOpCount = 0;
    s.mathOpPress = false;
    s.isInit = true;
    s.triggerArmed = false;
    writeMain('0');
    setHistory('');
  }

  function isNumChar(s: string | null) {
    if (s === null) return false;
    return /^\d$/.test(s);
  }

  function format(n: number | string): string {
    const v = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(v)) return 'Resultado indefinido';
    // até 10 dígitos significativos
    let str = String(v);
    if (str.length > 12) str = String(Math.round(v * 1e10) / 1e10);
    return str;
  }

  function handleSecret() {
    if (loading) return;
    // Em Electron: expande a janela para tamanho normal do app
    const api = (window as unknown as { electronAPI?: { appReveal?: () => Promise<boolean> } }).electronAPI;
    api?.appReveal?.();
    if (isAuthenticated) navigate('/dashboard');
    else navigate('/login');
  }

  function input(btn: string) {
    const s = stateRef.current;

    // Trigger secreto: pressionou `=` com display em 259 → segundo `=` libera.
    // Usa displayRef.current (síncrono) em vez do state main (assíncrono).
    if (btn === '=' && s.triggerArmed && displayRef.current === SECRET_FIRST) {
      handleSecret();
      return;
    }

    // copy prev math op
    if (
      isNumChar(s.prevBtn) &&
      btn !== '=' &&
      btn !== 'C' &&
      btn !== 'CE' &&
      btn !== 'CS' &&
      btn !== '.'
    ) {
      s.prevMathOp = s.mathOp;
    }

    switch (btn) {
      case '+':
        s.mathOpPress = true;
        s.mathOp = addition;
        break;
      case '-':
        s.mathOpPress = true;
        s.mathOp = subtraction;
        break;
      case '/':
        s.mathOpPress = true;
        s.mathOp = division;
        break;
      case '*':
        s.mathOpPress = true;
        s.mathOp = multiplication;
        break;
      case 'C':
        init();
        return;
    }

    handler(btn);
    s.prevBtn = btn;
    s.prevResult = s.result;
    s.isInit = false;

    // Arma o trigger quando, após `=`, o resultado calculado for 259.
    // Usa s.result (já atualizado pelo handler) em vez de displayRef pois o
    // formatador pode ter aplicado arredondamento.
    s.triggerArmed = btn === '=' && Math.round((s.result ?? 0) * 1e6) / 1e6 === 259;
  }

  function handler(btn: string) {
    const s = stateRef.current;

    // bloqueia se resultado é inválido
    if (
      btn !== 'C' &&
      (s.result === null ? false : !Number.isFinite(s.result))
    ) {
      return;
    }

    // update history
    if (btn !== '=' && btn !== 'C' && btn !== 'CE' && btn !== 'CS') {
      const prevIsNum = isNumChar(s.prevBtn);
      const curIsNum = /^\d$/.test(btn);
      setHistory((h) => {
        if (!prevIsNum && !curIsNum) return h.slice(0, -1) + btn;
        return h + btn;
      });
    }

    // dígito ou ponto
    if (/^\d$/.test(btn) || btn === '.') {
      if (btn === '.' && /^\d+$/.test(s.currNum)) {
        s.currNum = s.currNum + btn;
      } else if (/^\d$/.test(btn)) {
        const append =
          (isNumChar(s.prevBtn) && s.prevBtn !== null && displayRef.current !== '0') ||
          s.prevBtn === '.';
        s.currNum = append ? s.currNum + btn : btn;
      }
      s.mathOpPress = false;
      writeMain(format(s.currNum));
      return;
    }

    // sinais
    if (btn === '+' || btn === '-' || btn === '*' || btn === '/') {
      if ((s.prevBtn === null || s.prevBtn === '=') && !s.isInit) {
        setHistory('0' + btn);
        s.mathOpCount++;
      }
    }

    if (s.mathOp && s.result === null) {
      setResult(Number(s.currNum));
    }

    if (btn === '=') {
      if (s.mathOp) {
        s.mathOpCount = 0;
        if (s.mathOpPress) {
          s.mathOp(s.prevResult ?? 0);
        } else {
          s.mathOp(Number(s.currNum));
        }
        setHistory('');
        writeMain(format(s.result ?? 0));
      }
      return;
    }

    // contar ops em sequência
    if (
      !/^\d$/.test(btn) &&
      (isNumChar(s.prevBtn) || s.prevBtn === '%') &&
      btn !== '=' &&
      btn !== 'C' &&
      btn !== 'CE' &&
      btn !== 'CS' &&
      btn !== '.' &&
      btn !== '%'
    ) {
      s.mathOpCount++;
    }

    if (s.mathOpCount >= 2 && isNumChar(s.prevBtn) && s.prevMathOp) {
      s.prevMathOp(Number(s.currNum));
      writeMain(format(s.result ?? 0));
    }

    if (btn === 'CE') {
      s.currNum = '0';
      writeMain('0');
      setHistory('');
      return;
    }
    if (btn === 'CS') {
      s.currNum = s.currNum.length > 1 ? s.currNum.slice(0, -1) : '0';
      writeMain(format(s.currNum));
      setHistory((h) => h.slice(0, -1));
      return;
    }
    if (btn === '+-') {
      const n = Number(s.currNum);
      s.currNum = String(-n);
      writeMain(format(s.currNum));
      return;
    }
    if (btn === '%') {
      const base = s.result ?? 0;
      s.currNum = String((base * Number(s.currNum)) / 100);
      writeMain(format(s.currNum));
      return;
    }
  }

  // Suporte a teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      if (/^\d$/.test(k)) input(k);
      else if (k === '.' || k === ',') input('.');
      else if (k === '+' || k === '-' || k === '*' || k === '/') input(k);
      else if (k === 'Enter' || k === '=') {
        e.preventDefault();
        input('=');
      } else if (k === 'Backspace') input('CS');
      else if (k === 'Escape') input('C');
      else if (k === '%') input('%');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAuthenticated]);

  // Botões organizados em rows (4 colunas cada)
  const rows: Array<Array<{ label: React.ReactNode; value: string; cls?: string }>> = [
    [
      { label: '%', value: '%', cls: 'op' },
      { label: 'CE', value: 'CE', cls: 'op' },
      { label: 'C', value: 'C', cls: 'op' },
      { label: '⌫', value: 'CS', cls: 'op' },
    ],
    [
      { label: '⅟x', value: '1/x', cls: 'op disabled' },
      { label: 'x²', value: 'sqr', cls: 'op disabled' },
      { label: '√x', value: 'sqrt', cls: 'op disabled' },
      { label: '÷', value: '/', cls: 'op' },
    ],
    [
      { label: '7', value: '7' },
      { label: '8', value: '8' },
      { label: '9', value: '9' },
      { label: '×', value: '*', cls: 'op' },
    ],
    [
      { label: '4', value: '4' },
      { label: '5', value: '5' },
      { label: '6', value: '6' },
      { label: '−', value: '-', cls: 'op' },
    ],
    [
      { label: '1', value: '1' },
      { label: '2', value: '2' },
      { label: '3', value: '3' },
      { label: '+', value: '+', cls: 'op' },
    ],
    [
      { label: '±', value: '+-' },
      { label: '0', value: '0' },
      { label: ',', value: '.' },
      { label: '=', value: '=', cls: 'equals' },
    ],
  ];

  return (
    <div className="calc-root">
      <style>{calcCss}</style>
      <div className="calc-shell">
        <div className="calc-mode">Padrão</div>

        <div className="calc-screen">
          <div className="calc-history" aria-live="polite">
            {history || '\u00a0'}
          </div>
          <div className="calc-main" aria-live="polite">
            {main}
          </div>
        </div>

        <div className="calc-pad">
          {rows.map((row, ri) => (
            <div key={ri} className="calc-row">
              {row.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  className={`calc-btn ${b.cls || 'num'}`}
                  data-value={b.value}
                  onClick={() => {
                    if (b.cls?.includes('disabled')) return;
                    input(b.value);
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const calcCss = `
.calc-root {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #202020;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  -webkit-user-select: none;
  user-select: none;
}
.calc-shell {
  width: 320px;
  min-height: 500px;
  background: #f3f3f3;
  color: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
}
.calc-mode {
  padding: 10px 14px 6px 14px;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
  background: #f3f3f3;
}
.calc-screen {
  padding: 4px 14px 12px 14px;
  background: #f3f3f3;
  text-align: right;
  flex-shrink: 0;
}
.calc-history {
  height: 18px;
  font-size: 12px;
  color: #6a6a6a;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.calc-main {
  font-size: 36px;
  font-weight: 600;
  color: #1a1a1a;
  height: 48px;
  line-height: 48px;
  overflow: hidden;
  white-space: nowrap;
}
.calc-pad {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f3f3f3;
  padding: 2px 4px 8px 4px;
  gap: 2px;
}
.calc-row {
  flex: 1;
  display: flex;
  gap: 2px;
}
.calc-btn {
  flex: 1;
  border: 0;
  background: #fbfbfb;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  color: #1a1a1a;
  transition: background 80ms ease;
}
.calc-btn:hover { background: #f0f0f0; }
.calc-btn:active { background: #e0e0e0; }
.calc-btn.op {
  background: #f3f3f3;
  font-weight: 500;
}
.calc-btn.op:hover { background: #ebebeb; }
.calc-btn.equals {
  background: #4cc2ff;
  color: #1a1a1a;
  font-weight: 600;
}
.calc-btn.equals:hover { background: #3aafe9; }
.calc-btn.num { font-weight: 600; }
.calc-btn.disabled {
  color: #b5b5b5;
  cursor: default;
}
`;
