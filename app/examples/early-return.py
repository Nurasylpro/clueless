# Expected: True (1 appears twice).
def contains_duplicate(nums):
    seen = set()
    for n in nums:
        if n in seen:
            return True
        seen.add(n)
        return False


answer = contains_duplicate([3, 1, 4, 1])
print(answer)
