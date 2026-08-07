module.exports = {
	extends: ['@commitlint/config-conventional'],
	ignores: [(message) => /^Merge /.test(message)],
};
