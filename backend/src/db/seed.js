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
      console.log(`Problem "${prob.title}" already exists (id: ${problemId})`);
    } else {
      const insertProblem = await db.query(
        'INSERT INTO problems (title, description, difficulty) VALUES ($1, $2, $3) RETURNING id',
        [prob.title, prob.description, prob.difficulty]
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
    `Database seed completed. Problems created: ${problemsInserted}, Test cases created: ${testCasesInserted}.`
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
