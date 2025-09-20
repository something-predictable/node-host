import { Context, HandlerConfiguration, Json } from './context.js'
import { registerHttpHandler } from './host/http-registry.js'

export * from './context.js'

export type ResponseHeaders = {
    [key: string]: string
}

export type FullResult = {
    headers?: ResponseHeaders
    status?: number
    body?: unknown
}

export type Result = void | string | FullResult

export type HttpRequest = {
    readonly rawUrl: string
    readonly url: ParsedUrl
    readonly headers: Readonly<ResponseHeaders>
    readonly body?: Json | string
}

type Gone = 'Gone' | undefined

export type ParsedUrl = {
    /**
     * Gets the fragment portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://example.org/foo#bar');
     * console.log(myURL.hash);
     * // Prints #bar
     * ```
     */
    readonly hash: string
    /**
     * Gets the host portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://example.org:81/foo');
     * console.log(myURL.host);
     * // Prints example.org:81
     */
    readonly host: string
    /**
     * Gets the host name portion of the URL. The key difference between`url.host` and `url.hostname` is that `url.hostname` does _not_ include the
     * port.
     *
     * ```js
     * const myURL = new URL('https://example.org:81/foo');
     * console.log(myURL.hostname);
     * // Prints example.org
     */
    readonly hostname: string
    /**
     * Gets the serialized URL.
     *
     * ```js
     * const myURL = new URL('https://example.org/foo');
     * console.log(myURL.href);
     * // Prints https://example.org/foo
     * ```
     */
    readonly href: string
    /**
     * Gets the serialization of the URL's origin.
     *
     * ```js
     * const myURL = new URL('https://example.org/foo/bar?baz');
     * console.log(myURL.origin);
     * // Prints https://example.org
     * ```
     *
     * ```js
     * const idnURL = new URL('https://測試');
     * console.log(idnURL.origin);
     * // Prints https://xn--g6w251d
     *
     * console.log(idnURL.hostname);
     * // Prints xn--g6w251d
     * ```
     */
    readonly origin: string
    /**
     * Gets the password portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://abc:xyz@example.com');
     * console.log(myURL.password);
     * // Prints xyz
     *
     * myURL.password = '123';
     * console.log(myURL.href);
     * // Prints https://abc:123@example.com/
     * ```
     */
    readonly password: string
    /**
     * Gets the path portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://example.org/abc/xyz?123');
     * console.log(myURL.pathname);
     * // Prints /abc/xyz
     * ```
     */
    readonly pathname: string
    /**
     * Gets the port portion of the URL.
     *
     * The port value may be a number or a string containing a number in the range `0` to `65535` (inclusive). Setting the value to the default port of the `URL` objects given `protocol` will
     * result in the `port` value becoming
     * the empty string (`''`).
     *
     * The port value can be an empty string in which case the port depends on
     * the protocol/scheme.
     *
     * If that string is invalid but it begins with a number, the leading number is
     * assigned to `port`.
     * If the number lies outside the range denoted above, it is ignored.
     *
     * ```js
     * const myURL = new URL('https://example.org:8888');
     * console.log(myURL.port);
     * // Prints 8888
     * ```
     */
    readonly port: string
    /**
     * Gets the protocol portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://example.org');
     * console.log(myURL.protocol);
     * // Prints https:
     * ```
     */
    readonly protocol: string
    /**
     * Gets the serialized query portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://example.org/abc?123');
     * console.log(myURL.search);
     * // Prints ?123
     * ```
     *
     * Any invalid URL characters appearing in the value assigned the `search`property will be `percent-encoded`.
     */
    readonly search: string
    /**
     * Gets the `URLSearchParams` object representing the query parameters of the
     * URL.
     *
     * ```js
     * const myURL = new URL('https://example.org/abc?foo=~bar');
     *
     * console.log(myURL.search);  // prints ?foo=~bar
     * ```
     */
    readonly searchParams: URLSearchParams
    /**
     * Gets the username portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://abc:xyz@example.com');
     * console.log(myURL.username);
     * // Prints abc
     * ```
     *
     * Any invalid URL characters appearing in the value assigned the `username` property will be `percent-encoded`.
     */
    readonly username: string

    /**
     * Gets a step of the path portion of the URL.
     *
     * ```js
     * const myURL = new URL('https://example.org/abc/xyz?123');
     * console.log(myURL.pathStepAt(0));
     * // Prints abc
     * console.log(myURL.pathStepAt(1));
     * // Prints xyz
     * ```
     */
    pathStepAt: (index: number) => string

    /**
     * Gone, use searchParams instead.
     */
    query?: Gone

    /** @ignore */
    toJSON: () => string
}

export type HttpHandlerConfiguration = HandlerConfiguration & {
    /**
     * A string identifying which domains can access the endpoint cross-origin.
     * @default undefined
     */
    readonly cors?: string
}

export type Handler = (context: Context, request: HttpRequest) => Promise<Result> | Result

type Path<T> = T extends `/${string}` ? 'Error: path cannot start with slash.' : T

export function get<T extends string>(path: Path<T>, fn: Handler): void
export function get<T extends string>(
    path: Path<T>,
    config: HttpHandlerConfiguration,
    fn: Handler,
): void
export function get<T extends string>(
    path: Path<T>,
    configOrHandler: HttpHandlerConfiguration | Handler,
    fn?: Handler,
): void {
    registerHttpHandler('GET', path, configOrHandler, fn)
}
export function post<T extends string>(path: Path<T>, fn: Handler): void
export function post<T extends string>(
    path: Path<T>,
    config: HttpHandlerConfiguration,
    fn: Handler,
): void
export function post<T extends string>(
    path: Path<T>,
    configOrHandler: HttpHandlerConfiguration | Handler,
    fn?: Handler,
): void {
    registerHttpHandler('POST', path, configOrHandler, fn)
}
export function put<T extends string>(path: Path<T>, fn: Handler): void
export function put<T extends string>(
    path: Path<T>,
    config: HttpHandlerConfiguration,
    fn: Handler,
): void
export function put<T extends string>(
    path: Path<T>,
    configOrHandler: HttpHandlerConfiguration | Handler,
    fn?: Handler,
): void {
    registerHttpHandler('PUT', path, configOrHandler, fn)
}
export function patch<T extends string>(path: Path<T>, fn: Handler): void
export function patch<T extends string>(
    path: Path<T>,
    config: HttpHandlerConfiguration,
    fn: Handler,
): void
export function patch<T extends string>(
    path: Path<T>,
    configOrHandler: HttpHandlerConfiguration | Handler,
    fn?: Handler,
): void {
    registerHttpHandler('PATCH', path, configOrHandler, fn)
}
export function del<T extends string>(path: Path<T>, fn: Handler): void
export function del<T extends string>(
    path: Path<T>,
    config: HttpHandlerConfiguration,
    fn: Handler,
): void
export function del<T extends string>(
    path: Path<T>,
    configOrHandler: HttpHandlerConfiguration | Handler,
    fn?: Handler,
): void {
    registerHttpHandler('DELETE', path, configOrHandler, fn)
}
