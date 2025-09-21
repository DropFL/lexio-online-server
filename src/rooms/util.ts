export const checkPayload =
  <T>(validator: (payload: unknown) => payload is T) =>
  (payload: unknown) => {
    if (!validator(payload)) {
      throw new Error("Invalid payload");
    }

    return payload;
  };

const RANDOM_ID_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const createRandomId = (length: number): string => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += RANDOM_ID_CHARS.charAt(
      Math.floor(Math.random() * RANDOM_ID_CHARS.length)
    );
  }
  return result;
};

// Fisher–Yates shuffle
export const shuffleArrayInPlace = <T>(array: T[]) => {
  let currentIndex = array.length;

  while (currentIndex > 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // Swap elements
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
};
