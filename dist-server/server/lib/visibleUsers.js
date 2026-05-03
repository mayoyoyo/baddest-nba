const GENERATED_TEST_USERNAME_PATTERNS = [
    /^(?:img(?:hdr)?|imgsmoke_|perf|smoke_|verify_|vote)\d{6,}$/,
    /^e2e_\d{6,}$/,
    /^debugcheck(?:_\d+)?$/,
];
export function isVisibleUser(username) {
    const normalized = username.trim().toLowerCase();
    return !GENERATED_TEST_USERNAME_PATTERNS.some((pattern) => pattern.test(normalized));
}
