const db = require('./index');

const starterProblems = [
  {
    title: 'Two Sum',
    description: `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

Input Format:
- Line 1: Space-separated integers representing the array nums
- Line 2: An integer target

Output Format:
- Space-separated indices in ascending order (e.g. "0 1")`,
    difficulty: 'EASY',
    starter_code: {
      javascript: `/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number[]}\n */\nvar twoSum = function(nums, target) {\n    \n};`,
      python: `class Solution:\n    def twoSum(self, nums: list[int], target: int) -> list[int]:\n        pass`,
      cpp: `#include <vector>\n\nclass Solution {\npublic:\n    std::vector<int> twoSum(std::vector<int>& nums, int target) {\n        \n    }\n};`,
      java: `class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        \n    }\n}`
    },
    driver_code: {
      javascript: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim().split('\\n');\nif (input.length >= 2) {\n  const nums = input[0].trim().split(/\\s+/).map(Number);\n  const target = Number(input[1].trim());\n  let fn = null;\n  if (typeof twoSum === 'function') {\n    fn = twoSum;\n  } else if (typeof Solution === 'function') {\n    const sol = new Solution();\n    if (typeof sol.twoSum === 'function') fn = sol.twoSum.bind(sol);\n  }\n  if (!fn) throw new Error('twoSum function not found');\n  const res = fn(nums, target);\n  if (Array.isArray(res)) {\n    console.log(res.join(' '));\n  } else {\n    console.log(res);\n  }\n}`,
      python: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    lines = sys.stdin.read().strip().split('\\n')\n    if len(lines) >= 2:\n        nums = list(map(int, lines[0].strip().split()))\n        target = int(lines[1].strip())\n        fn = None\n        if 'Solution' in globals():\n            sol = Solution()\n            if hasattr(sol, 'twoSum'):\n                fn = sol.twoSum\n            elif hasattr(sol, 'two_sum'):\n                fn = sol.two_sum\n        if not fn:\n            if 'twoSum' in globals():\n                fn = globals()['twoSum']\n            elif 'two_sum' in globals():\n                fn = globals()['two_sum']\n        if not fn:\n            raise Exception('twoSum function not found')\n        res = fn(nums, target)\n        if isinstance(res, (list, tuple)):\n            print(' '.join(map(str, res)))\n        else:\n            print(res)\n\nif __name__ == '__main__':\n    __driver()`,
      cpp: `#include <iostream>\n#include <vector>\n#include <string>\n#include <sstream>\n\n{{USER_CODE}}\n\nint main() {\n    std::string line1, line2;\n    if (std::getline(std::cin, line1) && std::getline(std::cin, line2)) {\n        std::vector<int> nums;\n        std::stringstream ss(line1);\n        int val;\n        while (ss >> val) {\n            nums.push_back(val);\n        }\n        int target = std::stoi(line2);\n        Solution sol;\n        std::vector<int> res = sol.twoSum(nums, target);\n        for (size_t i = 0; i < res.size(); ++i) {\n            std::cout << res[i] << (i + 1 == res.size() ? "" : " ");\n        }\n        std::cout << std::endl;\n    }\n    return 0;\n}`,
      java: `import java.util.*;\nimport java.io.*;\n\n{{USER_CODE}}\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line1 = br.readLine();\n        String line2 = br.readLine();\n        if (line1 != null && line2 != null) {\n            String[] parts = line1.trim().split("\\\\s+");\n            int[] nums = new int[parts.length];\n            for (int i = 0; i < parts.length; i++) {\n                nums[i] = Integer.parseInt(parts[i]);\n            }\n            int target = Integer.parseInt(line2.trim());\n            Solution sol = new Solution();\n            int[] res = sol.twoSum(nums, target);\n            StringBuilder sb = new StringBuilder();\n            for (int i = 0; i < res.length; i++) {\n                if (i > 0) sb.append(" ");\n                sb.append(res[i]);\n            }\n            System.out.println(sb.toString());\n        }\n    }\n}`
    },
    testCases: [
      { input: '2 7 11 15\n9', expected_output: '0 1', is_hidden: false },
      { input: '3 2 4\n6', expected_output: '1 2', is_hidden: false },
      { input: '3 3\n6', expected_output: '0 1', is_hidden: true },
      { input: '1 5 8 10 14\n18', expected_output: '2 3', is_hidden: true }
    ]
  },
  {
    title: 'Reverse String',
    description: `Write a program that takes a string and prints the reversed string.

Input Format:
- A single line containing the string to reverse.

Output Format:
- The reversed string.`,
    difficulty: 'EASY',
    starter_code: {
      javascript: `/**\n * @param {string} s\n * @return {string}\n */\nvar reverseString = function(s) {\n    \n};`,
      python: `class Solution:\n    def reverseString(self, s: str) -> str:\n        pass`,
      cpp: `#include <string>\n\nclass Solution {\npublic:\n    std::string reverseString(std::string s) {\n        \n    }\n};`,
      java: `class Solution {\n    public String reverseString(String s) {\n        \n    }\n}`
    },
    driver_code: {
      javascript: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').replace(/\\r?\\n$/, '');\nlet fn = null;\nif (typeof reverseString === 'function') {\n  fn = reverseString;\n} else if (typeof Solution === 'function') {\n  const sol = new Solution();\n  if (typeof sol.reverseString === 'function') fn = sol.reverseString.bind(sol);\n}\nif (!fn) throw new Error('reverseString function not found');\nconst res = fn(input);\nconsole.log(res);`,
      python: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    input_data = sys.stdin.read().rstrip('\\r\\n')\n    fn = None\n    if 'Solution' in globals():\n        sol = Solution()\n        if hasattr(sol, 'reverseString'):\n            fn = sol.reverseString\n        elif hasattr(sol, 'reverse_string'):\n            fn = sol.reverse_string\n    if not fn:\n        if 'reverseString' in globals():\n            fn = globals()['reverseString']\n        elif 'reverse_string' in globals():\n            fn = globals()['reverse_string']\n    if not fn:\n        raise Exception('reverseString function not found')\n    print(fn(input_data))\n\nif __name__ == '__main__':\n    __driver()`,
      cpp: `#include <iostream>\n#include <string>\n\n{{USER_CODE}}\n\nint main() {\n    std::string s;\n    if (std::getline(std::cin, s)) {\n        Solution sol;\n        std::cout << sol.reverseString(s) << std::endl;\n    }\n    return 0;\n}`,
      java: `import java.io.*;\n\n{{USER_CODE}}\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line != null) {\n            Solution sol = new Solution();\n            System.out.println(sol.reverseString(line));\n        }\n    }\n}`
    },
    testCases: [
      { input: 'hello', expected_output: 'olleh', is_hidden: false },
      { input: 'InterviewSandbox', expected_output: 'xobdnaSweivretnI', is_hidden: false },
      { input: 'racecar', expected_output: 'racecar', is_hidden: true },
      { input: '1234567890', expected_output: '0987654321', is_hidden: true }
    ]
  },
  {
    title: 'Valid Parentheses',
    description: `Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.

Input Format:
- A single line containing the bracket string.

Output Format:
- "true" if the string is valid, "false" otherwise.`,
    difficulty: 'EASY',
    starter_code: {
      javascript: `/**\n * @param {string} s\n * @return {boolean}\n */\nvar isValid = function(s) {\n    \n};`,
      python: `class Solution:\n    def isValid(self, s: str) -> bool:\n        pass`,
      cpp: `#include <string>\n\nclass Solution {\npublic:\n    bool isValid(std::string s) {\n        \n    }\n};`,
      java: `class Solution {\n    public boolean isValid(String s) {\n        \n    }\n}`
    },
    driver_code: {
      javascript: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\nlet fn = null;\nif (typeof isValid === 'function') {\n  fn = isValid;\n} else if (typeof Solution === 'function') {\n  const sol = new Solution();\n  if (typeof sol.isValid === 'function') fn = sol.isValid.bind(sol);\n}\nif (!fn) throw new Error('isValid function not found');\nconst res = fn(input);\nconsole.log(String(res));`,
      python: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    input_data = sys.stdin.read().strip()\n    fn = None\n    if 'Solution' in globals():\n        sol = Solution()\n        if hasattr(sol, 'isValid'):\n            fn = sol.isValid\n        elif hasattr(sol, 'is_valid'):\n            fn = sol.is_valid\n    if not fn:\n        if 'isValid' in globals():\n            fn = globals()['isValid']\n        elif 'is_valid' in globals():\n            fn = globals()['is_valid']\n    if not fn:\n        raise Exception('isValid function not found')\n    res = fn(input_data)\n    print(str(res).lower())\n\nif __name__ == '__main__':\n    __driver()`,
      cpp: `#include <iostream>\n#include <string>\n\n{{USER_CODE}}\n\nint main() {\n    std::string s;\n    if (std::cin >> s) {\n        Solution sol;\n        std::cout << (sol.isValid(s) ? "true" : "false") << std::endl;\n    }\n    return 0;\n}`,
      java: `import java.io.*;\n\n{{USER_CODE}}\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line != null) {\n            Solution sol = new Solution();\n            System.out.println(sol.isValid(line.trim()) ? "true" : "false");\n        }\n    }\n}`
    },
    testCases: [
      { input: '()[]{}', expected_output: 'true', is_hidden: false },
      { input: '(]', expected_output: 'false', is_hidden: false },
      { input: '([{}])', expected_output: 'true', is_hidden: true },
      { input: '([)]', expected_output: 'false', is_hidden: true }
    ]
  },
  {
    title: 'Palindrome Number',
    description: `Given an integer x, return "true" if x is a palindrome, and "false" otherwise.

An integer is a palindrome when it reads the same forward and backward. For example, 121 is a palindrome while 123 is not. Negative numbers are not palindromes.

Input Format:
- An integer x.

Output Format:
- "true" if x is a palindrome, "false" otherwise.`,
    difficulty: 'EASY',
    starter_code: {
      javascript: `/**\n * @param {number} x\n * @return {boolean}\n */\nvar isPalindrome = function(x) {\n    \n};`,
      python: `class Solution:\n    def isPalindrome(self, x: int) -> bool:\n        pass`,
      cpp: `class Solution {\npublic:\n    bool isPalindrome(int x) {\n        \n    }\n};`,
      java: `class Solution {\n    public boolean isPalindrome(int x) {\n        \n    }\n}`
    },
    driver_code: {
      javascript: `{{USER_CODE}}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf8').trim();\nlet fn = null;\nif (typeof isPalindrome === 'function') {\n  fn = isPalindrome;\n} else if (typeof Solution === 'function') {\n  const sol = new Solution();\n  if (typeof sol.isPalindrome === 'function') fn = sol.isPalindrome.bind(sol);\n}\nif (!fn) throw new Error('isPalindrome function not found');\nconst res = fn(Number(input));\nconsole.log(String(res));`,
      python: `import sys\n\n{{USER_CODE}}\n\ndef __driver():\n    input_data = sys.stdin.read().strip()\n    fn = None\n    if 'Solution' in globals():\n        sol = Solution()\n        if hasattr(sol, 'isPalindrome'):\n            fn = sol.isPalindrome\n        elif hasattr(sol, 'is_palindrome'):\n            fn = sol.is_palindrome\n    if not fn:\n        if 'isPalindrome' in globals():\n            fn = globals()['isPalindrome']\n        elif 'is_palindrome' in globals():\n            fn = globals()['is_palindrome']\n    if not fn:\n        raise Exception('isPalindrome function not found')\n    res = fn(int(input_data))\n    print(str(res).lower())\n\nif __name__ == '__main__':\n    __driver()`,
      cpp: `#include <iostream>\n\n{{USER_CODE}}\n\nint main() {\n    int x;\n    if (std::cin >> x) {\n        Solution sol;\n        std::cout << (sol.isPalindrome(x) ? "true" : "false") << std::endl;\n    }\n    return 0;\n}`,
      java: `import java.io.*;\n\n{{USER_CODE}}\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line != null) {\n            Solution sol = new Solution();\n            System.out.println(sol.isPalindrome(Integer.parseInt(line.trim())) ? "true" : "false");\n        }\n    }\n}`
    },
    testCases: [
      { input: '121', expected_output: 'true', is_hidden: false },
      { input: '-121', expected_output: 'false', is_hidden: false },
      { input: '10', expected_output: 'false', is_hidden: true },
      { input: '12321', expected_output: 'true', is_hidden: true }
    ]
  }
];

const seed = async () => {
  console.log('Starting idempotent database seed...');
  let problemsInserted = 0;
  let testCasesInserted = 0;

  for (const prob of starterProblems) {
    let problemId;
    const existingProblem = await db.query(
      'SELECT id FROM problems WHERE title = $1',
      [prob.title]
    );

    if (existingProblem.rows.length > 0) {
      problemId = existingProblem.rows[0].id;
      await db.query(
        'UPDATE problems SET description = $1, difficulty = $2, starter_code = $3, driver_code = $4 WHERE id = $5',
        [prob.description, prob.difficulty, JSON.stringify(prob.starter_code || {}), JSON.stringify(prob.driver_code || {}), problemId]
      );
      console.log(`Updated problem "${prob.title}" with starter/driver code (id: ${problemId})`);
    } else {
      const insertProblem = await db.query(
        'INSERT INTO problems (title, description, difficulty, starter_code, driver_code) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [prob.title, prob.description, prob.difficulty, JSON.stringify(prob.starter_code || {}), JSON.stringify(prob.driver_code || {})]
      );
      problemId = insertProblem.rows[0].id;
      problemsInserted++;
      console.log(`Created problem "${prob.title}" (id: ${problemId})`);
    }

    for (const tc of prob.testCases) {
      const existingTc = await db.query(
        'SELECT id FROM test_cases WHERE problem_id = $1 AND input = $2 AND expected_output = $3',
        [problemId, tc.input, tc.expected_output]
      );

      if (existingTc.rows.length === 0) {
        await db.query(
          'INSERT INTO test_cases (problem_id, input, expected_output, is_hidden) VALUES ($1, $2, $3, $4)',
          [problemId, tc.input, tc.expected_output, tc.is_hidden]
        );
        testCasesInserted++;
      }
    }
  }

  console.log(
    `Database seed completed. Problems created/updated: ${starterProblems.length}, Test cases checked.`
  );
  return { problemsInserted, testCasesInserted };
};

if (require.main === module) {
  seed()
    .then(async () => {
      await db.pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await db.pool.end();
      process.exit(1);
    });
}

module.exports = seed;
