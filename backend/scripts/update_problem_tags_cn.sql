UPDATE problems
SET tags = jsonb_build_array(
    U&'\6570\5B66',
    U&'\591A\6587\4EF6\7F16\8BD1',
    U&'\6A21\62DF'
)
WHERE id = 12;

UPDATE problems
SET tags = jsonb_build_array(
    U&'\6570\5B66',
    U&'\591A\6587\4EF6\7F16\8BD1',
    'C++'
)
WHERE id = 11;
