/****************************************************************************
 * 1) 드럼 매핑 설정
 ****************************************************************************/
const NEW_DRUM_MAP = {
  23: 53, 24: 53, 25: 60, 26: 57, 28: 57, 29: 55, 30: 69,
  31: 64, 32: 71, 33: 55, 34: 67, 35: 64, 36: 65, 37: 72,
  38: 65, 39: 76, 40: 72, 41: 77, 42: 74, 43: 72, 44: 60,
  45: 72, 47: 76
};

/****************************************************************************
 * 2) 상대음 → 절대음 변환 함수
 ****************************************************************************/
function relativeToAbsolute(octave, note) {
  let baseNote, accidental;
  if (note.endsWith('+')) {
    baseNote = note.slice(0, -1);
    accidental = 1;
  } else if (note.endsWith('-')) {
    baseNote = note.slice(0, -1);
    accidental = -1;
  } else {
    baseNote = note;
    accidental = 0;
  }
  
  const baseSemitones = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  if (!(baseNote in baseSemitones)) return null;
  
  let semitone = baseSemitones[baseNote] + accidental;
  let absVal = octave * 12 + semitone;
  
  // o2, 'a' 특수 보정
  if (octave === 2 && baseNote === 'a' && accidental === 0) {
    absVal += 2;
  }
  return absVal;
}

function handleAbsoluteNote(absNote, lengthVal, dotted) {
  // absNote: "n30", "n25" 등 (예: n30)
  // lengthVal, dotted: 파싱된 길이
  // (수정 전에는 여기서 n30 → n69 매핑을 했지만, 
  // 이제는 모든 절대음을 "있는 그대로" 유지합니다.)

  // [수정됨] : noteNumber를 매핑하지 않고 그대로 반환
  return `l${lengthVal}${dotted ? '.' : ''} ${absNote}`;
}

/****************************************************************************
 * 2-1) 모든 nXX를 최종적으로 드럼 매핑에 반영하는 함수
 *      => 마지막에 한 번 더 nXX -> nYY 변환
 ****************************************************************************/
function mapAbsoluteNotes(mml) {
  // n(\d+) 형태를 모두 찾아서, NEW_DRUM_MAP에 있으면 치환
  return mml.replace(/n(\d+)/g, (match, p1) => {
    const num = parseInt(p1, 10);
    const mappedVal = NEW_DRUM_MAP[num];
    if (mappedVal !== undefined) {
      return "n" + mappedVal;
    } else {
      return match;  // 매핑 실패 시 원본 유지 (ex n999)
    }
  });
}

/****************************************************************************
 * 3) 파싱 유틸 함수
 ****************************************************************************/
function parseLengthMacro(token) {
  const m = token.match(/^l(\d+)(\.)?$/);
  if (m) {
    return { lengthVal: parseInt(m[1], 10), dotted: m[2] === '.' };
  }
  return null;
}

function parseNoteLength(token) {
  const m = token.match(/^([abcdefg][+\-]?)(\d+)?(\.?)$/);
  if (!m) return null;
  return {
    noteName: m[1],
    lengthVal: m[2] ? parseInt(m[2], 10) : null,
    dotted: m[3] === '.'
  };
}

function parseRestLength(token) {
  const m = token.match(/^r(\d*)(\.?)$/);
  if (!m) return null;
  return {
    lengthVal: m[1] ? parseInt(m[1], 10) : null,
    dotted: m[2] === '.'
  };
}

function parseAbsoluteLength(token) {
  const m = token.match(/^(n\d+)(\d+)?(\.?)$/);
  if (!m) return null;
  return {
    absNote: m[1],
    lengthVal: m[2] ? parseInt(m[2], 10) : null,
    dotted: m[3] === '.'
  };
}

/****************************************************************************
 * 4) 메인 변환 함수
 ****************************************************************************/
function convertMmlForLostark(mml) {
  const tokenPattern = /(o\d+|[<>]|l\d+\.?|&|[abcdefg][+\-]?\d*\.?|r\d*\.?|n\d+\d*\.?|v\d+|t\d+|\d+\.?|\.)/g;
  const tokens = mml.match(tokenPattern) || [];
  let currentOctave = 4;
  let defaultLengthVal = 4;
  let defaultLengthDotted = false;
  const convertedTokens = [];

  tokens.forEach(token => {
    // (A) 옥타브 설정
    if (/^o\d+$/.test(token)) {
      currentOctave = parseInt(token.slice(1), 10);
      return;
    }
    if (token === '>') { currentOctave++; return; }
    if (token === '<') { currentOctave--; return; }

    // (B) 길이 매크로 lN(.)
    const lengthMacro = parseLengthMacro(token);
    if (lengthMacro) {
      defaultLengthVal = lengthMacro.lengthVal;
      defaultLengthDotted = lengthMacro.dotted;
      convertedTokens.push(token);
      return;
    }

    // (C) 붙임표
    if (token === '&') {
      convertedTokens.push(token);
      return;
    }

    // (D) 쉼표(r + 길이)
    const restInfo = parseRestLength(token);
    if (restInfo) {
      let lengthVal = restInfo.lengthVal;
      let dotted = restInfo.dotted;
      if (lengthVal == null) {
        lengthVal = defaultLengthVal;
        if (!dotted) dotted = defaultLengthDotted;
      }
      convertedTokens.push(`l${lengthVal}${dotted ? '.' : ''} r`);
      return;
    }

    // (E) '이미' 절대음(nXX + 길이)
    const absInfo = parseAbsoluteLength(token);
    if (absInfo) {
      let { absNote, lengthVal, dotted } = absInfo;
      if (lengthVal == null) {
        lengthVal = defaultLengthVal;
        if (!dotted) dotted = defaultLengthDotted;
      }
      // [수정됨] 이제 여기서 드럼 매핑하지 않고, 그대로 nXX 유지
      const replacedStr = handleAbsoluteNote(absNote, lengthVal, dotted);
      convertedTokens.push(replacedStr);
      return;
    }

    // (F) 상대음(c, c-, etc.) → 우선 절대음 nXX로 변환
    const noteInfo = parseNoteLength(token);
    if (noteInfo) {
      const { noteName } = noteInfo;
      let lengthVal = noteInfo.lengthVal;
      let dotted = noteInfo.dotted;
      if (lengthVal == null) {
        lengthVal = defaultLengthVal;
        if (!dotted) dotted = defaultLengthDotted;
      }

      // 1) 상대음을 절대 값(예: 30)으로 변환
      const intermediate = relativeToAbsolute(currentOctave, noteName);
      let replacedStr;
      if (intermediate === null) {
        // 변환 실패 시 원본
        replacedStr = token;
      } else {
        // 절대음 형태 "n30" 등으로 만들어둠
        replacedStr = `n${intermediate}`;
      }

      // (예: "l4 n30")
      convertedTokens.push(`l${lengthVal}${dotted ? '.' : ''} ${replacedStr}`);
      return;
    }

    // (G) 그 외
    convertedTokens.push(token);
  });

  // 붙임표 후처리
  for (let i = 0; i < convertedTokens.length; i++) {
    if (convertedTokens[i] === "&") {
      if (i + 1 < convertedTokens.length) {
        let tokenToReplace = convertedTokens[i + 1];
        tokenToReplace = tokenToReplace.replace(/^(l\d+(\.?)\s+)(n\d+)/, '$1r');
        convertedTokens[i + 1] = tokenToReplace;
      }
    }
  }

  // 1차 머지
  let merged = convertedTokens.join(" ");
  merged = merged.replace(/(n\d+)\s+(?=n\d+)/g, '$1 ');

  // [수정됨] 마지막 단계에서 nXX → nYY 드럼 매핑
  const finalMapped = mapAbsoluteNotes(merged);

  return finalMapped;
}

/****************************************************************************
 * 5) 불필요한 l 매크로 제거
 ****************************************************************************/
function parseLMacro(token) {
  const re = /^l(\d+)(\.)?$/;
  const match = token.match(re);
  if (match) {
    return { lengthVal: parseInt(match[1], 10), dotted: match[2] === '.' };
  }
  return null;
}

function removeRedundantLMacros(mml) {
  const tokenPattern = /(l\d+\.?|[^\s]+)/g;
  const tokens = mml.match(tokenPattern) || [];
  let lastL = null;
  const resultTokens = [];
  
  tokens.forEach(token => {
    const lInfo = parseLMacro(token);
    if (lInfo) {
      if (lastL && lastL.lengthVal === lInfo.lengthVal && lastL.dotted === lInfo.dotted) {
        return; // 중복된 l 매크로는 무시
      } else {
        lastL = lInfo;
        resultTokens.push(token);
      }
    } else {
      resultTokens.push(token);
    }
  });
  
  const merged = resultTokens.join(" ");
  return merged.replace(/\s+/g, "");
}

/****************************************************************************
 * 6) DOM 이벤트 연결 및 옵션 통합
 ****************************************************************************/
document.addEventListener("DOMContentLoaded", function() {
  const inputMML = document.getElementById("inputMML");
  const outputFields = [
    document.getElementById("outputMML1"),
    document.getElementById("outputMML2"),
    document.getElementById("outputMML3")
  ];
  const convertButton = document.getElementById("convertButton");
  const copyButton = document.getElementById("copyButton");
  
  // 옵션 체크박스 (HTML에 추가되어 있다고 가정)
  const removeVCheckbox = document.getElementById("removeVCommand");
  const removeTCheckbox = document.getElementById("removeTCommand");

  // 변환 버튼 클릭 시 이벤트
  convertButton.addEventListener("click", function() {
    let originalMML = inputMML.value;
    
    // 옵션: v 명령어 제거
    if (removeVCheckbox && removeVCheckbox.checked) {
      originalMML = originalMML.replace(/v\d+/gi, "");
    }
    // 옵션: t 명령어 제거
    if (removeTCheckbox && removeTCheckbox.checked) {
      originalMML = originalMML.replace(/t\d+/gi, "");
    }
    
    // 쉼표로 나누고 최대 3개까지만 처리
    const splitted = originalMML.split(",");
    for (let i = 0; i < 3; i++) {
      // splitted[i]가 없으면 빈 문자열
      let piece = splitted[i] || "";
      let converted = convertMmlForLostark(piece);
      let finalResult = removeRedundantLMacros(converted);
      // 출력창에 표시
      outputFields[i].value = finalResult;
    }
  });

  // Copy 버튼 클릭 이벤트
  const copyButtons = document.querySelectorAll(".copyButton");
  copyButtons.forEach(button => {
    button.addEventListener("click", function() {
      // data-target 속성에서 복사할 textarea의 id를 가져옴
      const targetId = button.getAttribute("data-target");
      const textArea = document.getElementById(targetId);
      if (textArea) {
        const textToCopy = textArea.value;
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            alert("클립보드에 복사되었습니다!");
          })
          .catch(err => {
            console.error("복사 실패: ", err);
          });
      }
    });
  });
});
