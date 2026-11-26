const { isStandaloneCode, wrapCode } = require('../services/codeWrapper');
const { spawnSync } = require('child_process');
const seed = require('../db/seed');

// Starter problem drivers from seed script
const getProblemSeed = (title) => {
  // Re-read seed data
  delete require.cache[require.resolve('../db/seed')];
  // We can test against the drivers defined in seed
  const fs = require('fs');
  const path = require('path');
  const seedContent = fs.readFileSync(path.join(__dirname, '../db/seed.js'), 'utf8');
  // We can import or inspect starterProblems
};

describe('codeWrapper Service', () => {
  describe('isStandaloneCode Detection', () => {
    it('should detect Node.js stdin / readline boilerplate as standalone', () => {
      expect(isStandaloneCode("const fs = require('fs'); const input = fs.readFileSync(0, 'utf8');", 'javascript')).toBe(true);
      expect(isStandaloneCode("process.stdin.on('data', chunk => {});", 'javascript')).toBe(true);
      expect(isStandaloneCode("const readline = require('readline'); readline.createInterface({...})", 'javascript')).toBe(true);
    });

    it('should detect Python stdin reading as standalone', () => {
      expect(isStandaloneCode("import sys\nlines = sys.stdin.read().split()", 'python')).toBe(true);
      expect(isStandaloneCode("x = int(input())\nprint(x)", 'python')).toBe(true);
    });

    it('should detect C++ and Java main entry points as standalone', () => {
      expect(isStandaloneCode("int main() {\n    return 0;\n}", 'cpp')).toBe(true);
      expect(isStandaloneCode("public class Main {\n    public static void main(String[] args) {}\n}", 'java')).toBe(true);
    });

    it('should NOT flag function-only solutions as standalone', () => {
      expect(isStandaloneCode("var isPalindrome = function(x) { return x >= 0; };", 'javascript')).toBe(false);
      expect(isStandaloneCode("function twoSum(nums, target) { return [0, 1]; }", 'javascript')).toBe(false);
      expect(isStandaloneCode("const isValid = (s) => true;", 'javascript')).toBe(false);
      expect(isStandaloneCode("class Solution:\n    def isPalindrome(self, x: int) -> bool:\n        return True", 'python')).toBe(false);
      expect(isStandaloneCode("def two_sum(nums, target):\n    return [0, 1]", 'python')).toBe(false);
      expect(isStandaloneCode("class Solution {\npublic:\n    bool isPalindrome(int x) { return true; }\n};", 'cpp')).toBe(false);
      expect(isStandaloneCode("class Solution {\n    public boolean isPalindrome(int x) { return true; }\n}", 'java')).toBe(false);
    });
  });

  describe('wrapCode Transformation', () => {
    const driverTemplate = '// Driver Header\n{{USER_CODE}}\n// Driver Footer';

    it('should interpolate user code into {{USER_CODE}} placeholder', () => {
      const userCode = 'function solve() { return 42; }';
      const result = wrapCode({ sourceCode: userCode, language: 'javascript', driverCode: driverTemplate });
      expect(result).toBe('// Driver Header\nfunction solve() { return 42; }\n// Driver Footer');
    });

    it('should bypass wrapping if code already reads stdin or defines main', () => {
      const standalone = "const fs = require('fs'); console.log(fs.readFileSync(0, 'utf8'));";
      const result = wrapCode({ sourceCode: standalone, language: 'javascript', driverCode: driverTemplate });
      expect(result).toBe(standalone);
    });

    it('should fall back to original code if driverCode is missing or empty', () => {
      const userCode = 'function solve() {}';
      expect(wrapCode({ sourceCode: userCode, language: 'c', driverCode: undefined })).toBe(userCode);
      expect(wrapCode({ sourceCode: userCode, language: 'c', driverCode: '' })).toBe(userCode);
      expect(wrapCode({ sourceCode: userCode, language: 'c', driverCode: null })).toBe(userCode);
    });

    it('should safely handle special regex characters ($) in candidate code', () => {
      const userCodeWithDollar = 'var price = "$100";';
      const result = wrapCode({ sourceCode: userCodeWithDollar, language: 'javascript', driverCode: driverTemplate });
      expect(result).toContain('var price = "$100";');
    });
  });

  describe('End-to-End Execution with Seeded Drivers', () => {
    // Extract drivers from seed file
    const seedProblems = [
      {
        title: 'Palindrome Number',
        jsDriver: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\nlet fn = null;\nif (typeof isPalindrome === 'function') {\n  fn = isPalindrome;\n} else if (typeof Solution === 'function') {\n  const sol = new Solution();\n  if (typeof sol.isPalindrome === 'function') fn = sol.isPalindrome.bind(sol);\n}\nif (!fn) throw new Error('isPalindrome function not found');\nconst res = fn(Number(input));\nconsole.log(String(res));`,
        pyDriver: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    input_data = sys.stdin.read().strip()\n    fn = None\n    if 'Solution' in globals():\n        sol = Solution()\n        if hasattr(sol, 'isPalindrome'):\n            fn = sol.isPalindrome\n        elif hasattr(sol, 'is_palindrome'):\n            fn = sol.is_palindrome\n    if not fn:\n        if 'isPalindrome' in globals():\n            fn = globals()['isPalindrome']\n        elif 'is_palindrome' in globals():\n            fn = globals()['is_palindrome']\n    if not fn:\n        raise Exception('isPalindrome function not found')\n    res = fn(int(input_data))\n    print(str(res).lower())\n\nif __name__ == '__main__':\n    __driver()`,
        jsSolution: `var isPalindrome = function(x) {\n  if (x < 0) return false;\n  let rev = 0, temp = x;\n  while (temp > 0) {\n    rev = rev * 10 + (temp % 10);\n    temp = Math.floor(temp / 10);\n  }\n  return rev === x;\n};`,
        pySolution: `class Solution:\n    def isPalindrome(self, x: int) -> bool:\n        if x < 0:\n            return False\n        s = str(x)\n        return s == s[::-1]`,
        testCases: [
          { input: '121', expected: 'true' },
          { input: '-121', expected: 'false' },
          { input: '10', expected: 'false' },
          { input: '12321', expected: 'true' },
        ],
      },
      {
        title: 'Two Sum',
        jsDriver: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim().split('\\n');\nif (input.length >= 2) {\n  const nums = input[0].trim().split(/\\s+/).map(Number);\n  const target = Number(input[1].trim());\n  let fn = null;\n  if (typeof twoSum === 'function') {\n    fn = twoSum;\n  } else if (typeof Solution === 'function') {\n    const sol = new Solution();\n    if (typeof sol.twoSum === 'function') fn = sol.twoSum.bind(sol);\n  }\n  if (!fn) throw new Error('twoSum function not found');\n  const res = fn(nums, target);\n  if (Array.isArray(res)) {\n    console.log(res.join(' '));\n  } else {\n    console.log(res);\n  }\n}`,
        pyDriver: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    lines = sys.stdin.read().strip().split('\\n')\n    if len(lines) >= 2:\n        nums = list(map(int, lines[0].strip().split()))\n        target = int(lines[1].strip())\n        fn = None\n        if 'Solution' in globals():\n            sol = Solution()\n            if hasattr(sol, 'twoSum'):\n                fn = sol.twoSum\n            elif hasattr(sol, 'two_sum'):\n                fn = sol.two_sum\n        if not fn:\n            if 'twoSum' in globals():\n                fn = globals()['twoSum']\n            elif 'two_sum' in globals():\n                fn = globals()['two_sum']\n        if not fn:\n            raise Exception('twoSum function not found')\n        res = fn(nums, target)\n        if isinstance(res, (list, tuple)):\n            print(' '.join(map(str, res)))\n        else:\n            print(res)\n\nif __name__ == '__main__':\n    __driver()`,
        jsSolution: `var twoSum = function(nums, target) {\n  const map = new Map();\n  for (let i = 0; i < nums.length; i++) {\n    const diff = target - nums[i];\n    if (map.has(diff)) return [map.get(diff), i];\n    map.set(nums[i], i);\n  }\n};`,
        pySolution: `def two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen:\n            return [seen[diff], i]\n        seen[num] = i`,
        testCases: [
          { input: '2 7 11 15\n9', expected: '0 1' },
          { input: '3 2 4\n6', expected: '1 2' },
          { input: '3 3\n6', expected: '0 1' },
        ],
      },
      {
        title: 'Reverse String',
        jsDriver: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').replace(/\\r?\\n$/, '');\nlet fn = null;\nif (typeof reverseString === 'function') {\n  fn = reverseString;\n} else if (typeof Solution === 'function') {\n  const sol = new Solution();\n  if (typeof sol.reverseString === 'function') fn = sol.reverseString.bind(sol);\n}\nif (!fn) throw new Error('reverseString function not found');\nconst res = fn(input);\nconsole.log(res);`,
        pyDriver: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    input_data = sys.stdin.read().rstrip('\\r\\n')\n    fn = None\n    if 'Solution' in globals():\n        sol = Solution()\n        if hasattr(sol, 'reverseString'):\n            fn = sol.reverseString\n        elif hasattr(sol, 'reverse_string'):\n            fn = sol.reverse_string\n    if not fn:\n        if 'reverseString' in globals():\n            fn = globals()['reverseString']\n        elif 'reverse_string' in globals():\n            fn = globals()['reverse_string']\n    if not fn:\n        raise Exception('reverseString function not found')\n    print(fn(input_data))\n\nif __name__ == '__main__':\n    __driver()`,
        jsSolution: `const reverseString = (s) => s.split('').reverse().join('');`,
        pySolution: `class Solution:\n    def reverseString(self, s: str) -> str:\n        return s[::-1]`,
        testCases: [
          { input: 'hello', expected: 'olleh' },
          { input: 'InterviewSandbox', expected: 'xobdnaSweivretnI' },
          { input: 'racecar', expected: 'racecar' },
        ],
      },
      {
        title: 'Valid Parentheses',
        jsDriver: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\nlet fn = null;\nif (typeof isValid === 'function') {\n  fn = isValid;\n} else if (typeof Solution === 'function') {\n  const sol = new Solution();\n  if (typeof sol.isValid === 'function') fn = sol.isValid.bind(sol);\n}\nif (!fn) throw new Error('isValid function not found');\nconst res = fn(input);\nconsole.log(String(res));`,
        pyDriver: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    input_data = sys.stdin.read().strip()\n    fn = None\n    if 'Solution' in globals():\n        sol = Solution()\n        if hasattr(sol, 'isValid'):\n            fn = sol.isValid\n        elif hasattr(sol, 'is_valid'):\n            fn = sol.is_valid\n    if not fn:\n        if 'isValid' in globals():\n            fn = globals()['isValid']\n        elif 'is_valid' in globals():\n            fn = globals()['is_valid']\n    if not fn:\n        raise Exception('isValid function not found')\n    res = fn(input_data)\n    print(str(res).lower())\n\nif __name__ == '__main__':\n    __driver()`,
        jsSolution: `function isValid(s) {\n  const stack = [];\n  const map = { ')': '(', '}': '{', ']': '[' };\n  for (const c of s) {\n    if (c === '(' || c === '{' || c === '[') stack.push(c);\n    else if (stack.pop() !== map[c]) return false;\n  }\n  return stack.length === 0;\n}`,
        pySolution: `def is_valid(s: str) -> bool:\n    stack = []\n    mapping = {')': '(', '}': '{', ']': '['}\n    for char in s:\n        if char in '({[':\n            stack.append(char)\n        elif not stack or stack.pop() != mapping[char]:\n            return False\n    return len(stack) == 0`,
        testCases: [
          { input: '()[]{}', expected: 'true' },
          { input: '(]', expected: 'false' },
          { input: '([{}])', expected: 'true' },
        ],
      },
    ];

    describe('JavaScript execution against test cases', () => {
      for (const prob of seedProblems) {
        it(`should execute wrapped JS ${prob.title} solution and produce exact expected outputs`, () => {
          const wrapped = wrapCode({
            sourceCode: prob.jsSolution,
            language: 'javascript',
            driverCode: prob.jsDriver,
          });

          for (const tc of prob.testCases) {
            const proc = spawnSync('node', ['-e', wrapped], {
              input: tc.input,
              encoding: 'utf8',
            });

            expect(proc.status).toBe(0);
            expect(proc.stdout.trim()).toBe(tc.expected);
          }
        });
      }
    });

    describe('Python execution against test cases', () => {
      for (const prob of seedProblems) {
        it(`should execute wrapped Python ${prob.title} solution and produce exact expected outputs`, () => {
          const wrapped = wrapCode({
            sourceCode: prob.pySolution,
            language: 'python',
            driverCode: prob.pyDriver,
          });

          const procCheck = spawnSync('python', ['--version'], { encoding: 'utf8' });
          if (procCheck.status !== 0) {
            console.warn('Python not available, skipping Python execution tests');
            return;
          }

          for (const tc of prob.testCases) {
            const proc = spawnSync('python', ['-c', wrapped], {
              input: tc.input,
              encoding: 'utf8',
            });

            expect(proc.status).toBe(0);
            expect(proc.stdout.trim()).toBe(tc.expected);
          }
        });
      }
    });
  });
});
