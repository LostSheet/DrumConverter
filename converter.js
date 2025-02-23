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
    // 옥타브 처리
    if (/^o\d+$/.test(token)) {
      currentOctave = parseInt(token.slice(1), 10);
      return;
    }
    if (token === '>') { currentOctave++; return; }
    if (token === '<') { currentOctave--; return; }

    // 길이 매크로
    const lengthMacro = parseLengthMacro(token);
    if (lengthMacro) {
      defaultLengthVal = lengthMacro.lengthVal;
      defaultLengthDotted = lengthMacro.dotted;
      convertedTokens.push(token);
      return;
    }

    // 붙임표는 그대로 추가
    if (token === '&') {
      convertedTokens.push(token);
      return;
    }

    // 쉼표 처리
    const restInfo = parseRestLength(token);
    if (restInfo) {
      let lengthVal = restInfo.lengthVal;
      let dotted = restInfo.dotted;
      if (lengthVal === null) {
        lengthVal = defaultLengthVal;
        if (!dotted) dotted = defaultLengthDotted;
      }
      convertedTokens.push(`l${lengthVal}${dotted ? '.' : ''} r`);
      return;
    }

    // 절대음 처리
    const absInfo = parseAbsoluteLength(token);
    if (absInfo) {
      let lengthVal = absInfo.lengthVal;
      let dotted = absInfo.dotted;
      if (lengthVal === null) {
        lengthVal = defaultLengthVal;
        if (!dotted) dotted = defaultLengthDotted;
      }
      convertedTokens.push(`l${lengthVal}${dotted ? '.' : ''} ${absInfo.absNote}`);
      return;
    }

    // 상대음 처리
    const noteInfo = parseNoteLength(token);
    if (noteInfo) {
      const intermediate = relativeToAbsolute(currentOctave, noteInfo.noteName);
      let replacedStr;
      if (intermediate === null) {
        replacedStr = token;
      } else {
        const finalVal = NEW_DRUM_MAP[intermediate];
        replacedStr = (finalVal === undefined) ? token : `n${finalVal}`;
      }
      let lengthVal = noteInfo.lengthVal;
      let dotted = noteInfo.dotted;
      if (lengthVal === null) {
        lengthVal = defaultLengthVal;
        if (!dotted) dotted = defaultLengthDotted;
      }
      convertedTokens.push(`l${lengthVal}${dotted ? '.' : ''} ${replacedStr}`);
      return;
    }

    // 그 외 (v, t 등 포함)
    convertedTokens.push(token);
  });

  // 붙임표 후처리: & 다음 토큰의 음표를 쉼표로 변경
  for (let i = 0; i < convertedTokens.length; i++) {
    if (convertedTokens[i] === "&") {
      if (i + 1 < convertedTokens.length) {
        let tokenToReplace = convertedTokens[i + 1];
        tokenToReplace = tokenToReplace.replace(/^(l\d+(\.?)\s+)(n\d+)/, '$1r');
        convertedTokens[i + 1] = tokenToReplace;
      }
    }
  }
  
  let merged = convertedTokens.join(" ");
  merged = merged.replace(/(n\d+)\s+(?=n\d+)/g, '$1 ');
  return merged;
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
