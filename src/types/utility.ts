export type Without<T, U> = {
	[K in Exclude<keyof T, keyof U>]?: never;
};

export type XOR<T, U> = (T | U) extends object
	? (Without<T, U> & U) | (Without<U, T> & T)
	: T | U;
