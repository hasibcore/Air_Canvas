using AirCanvas.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register Subscription & Google Play Billing Services
builder.Services.AddSingleton<IGooglePlayService, GooglePlayService>();
builder.Services.AddScoped<IEntitlementService, EntitlementService>();

// Configure CORS from explicit allowlist (wildcard only when explicitly requested)
var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("ConfiguredOrigins", policy =>
    {
        if (configuredOrigins.Length > 0 && !configuredOrigins.Contains("*"))
        {
            policy.WithOrigins(configuredOrigins)
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        }
        else if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin()
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        }
        else
        {
            policy.WithOrigins("https://localhost")
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        }
    });
});

// Configure JWT Authentication (fail closed outside Development if secret is missing or placeholder)
var jwtSecret = builder.Configuration["Supabase:JwtSecret"];
const string devPlaceholderSecret = "aircanvas-super-secret-development-jwt-signing-key-32chars";
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32 ||
    (!builder.Environment.IsDevelopment() && string.Equals(jwtSecret, devPlaceholderSecret, StringComparison.Ordinal)))
{
    if (!builder.Environment.IsDevelopment())
    {
        throw new InvalidOperationException("Supabase:JwtSecret must be configured (>= 32 chars) outside Development.");
    }
    jwtSecret = devPlaceholderSecret;
}

var jwtIssuer = builder.Configuration["Supabase:Issuer"];
var jwtAudience = builder.Configuration["Supabase:Audience"];

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = !string.IsNullOrWhiteSpace(jwtIssuer),
            ValidIssuer = jwtIssuer,
            ValidateAudience = !string.IsNullOrWhiteSpace(jwtAudience),
            ValidAudience = jwtAudience,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    });

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});

app.UseCors("ConfiguredOrigins");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "AIRCanvas.Api",
    version = "1.7.1",
    plans = new[] { "FREE", "PRO" },
    timestamp = DateTime.UtcNow
}));

app.Run();
