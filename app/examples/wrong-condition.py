# Expected: False (all values are distinct).
def contains_duplicate(nums):
    seen = set()
    for n in nums:
        if n not in seen:
            return True
        seen.add(n)
    return False


answer = contains_duplicate([1, 2, 3, 4])
print(answer)
