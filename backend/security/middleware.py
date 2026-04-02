from django.conf import settings


class SecurityHeadersMiddleware:
    """Attach baseline hardening headers including CSP."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        csp_parts = []
        if getattr(settings, "CSP_DEFAULT_SRC", ()):
            csp_parts.append(f"default-src {' '.join(settings.CSP_DEFAULT_SRC)}")
        if getattr(settings, "CSP_SCRIPT_SRC", ()):
            csp_parts.append(f"script-src {' '.join(settings.CSP_SCRIPT_SRC)}")
        if getattr(settings, "CSP_STYLE_SRC", ()):
            csp_parts.append(f"style-src {' '.join(settings.CSP_STYLE_SRC)}")
        if csp_parts and "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = "; ".join(csp_parts)

        return response
