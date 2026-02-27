import { type NextRequest, NextResponse, userAgent } from 'next/server'
import { createClient } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
    const origin = request.headers.get('origin')
    const isMobileOrigin = origin && (origin.startsWith('capacitor://') || origin.startsWith('http://localhost'))

    // Handle OPTIONS request for CORS preflight intercept
    if (request.method === 'OPTIONS') {
        const preflightHeaders = new Headers()
        if (isMobileOrigin) {
            preflightHeaders.set('Access-Control-Allow-Origin', origin)
            preflightHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
            preflightHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-pipeline-service')
            preflightHeaders.set('Access-Control-Allow-Credentials', 'true')
        }
        return new NextResponse(null, { headers: preflightHeaders, status: 204 })
    }

    const { supabase, response } = createClient(request)

    // Append CORS to all other responses
    if (isMobileOrigin) {
        response.headers.set('Access-Control-Allow-Origin', origin)
        response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-pipeline-service')
        response.headers.set('Access-Control-Allow-Credentials', 'true')
    }

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const url = request.nextUrl.clone()
    const { device } = userAgent(request)
    const isMobile = device.type === 'mobile' || device.type === 'tablet'

    // Device-specific routing for root path '/'
    if (url.pathname === '/') {
        // If mobile user visits root, redirect to login
        if (isMobile) {
            // If logged in, go to dashboard, else login
            if (user) {
                url.pathname = '/dashboard'
                return NextResponse.redirect(url, { headers: response.headers })
            } else {
                url.pathname = '/login'
                return NextResponse.redirect(url, { headers: response.headers })
            }
        }
    }

    // Auth protection for /dashboard routes
    if (url.pathname.startsWith('/dashboard')) {
        if (!user) {
            url.pathname = '/login'
            return NextResponse.redirect(url, { headers: response.headers })
        }
    }

    // Auth pages (login/signup) - Redirect to dashboard if already logged in
    if (url.pathname === '/login' || url.pathname === '/signup') {
        if (user) {
            url.pathname = '/dashboard'
            return NextResponse.redirect(url, { headers: response.headers })
        }
    }

    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - auth/callback (auth callback route)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
        '/api/:path*',
    ],
}
